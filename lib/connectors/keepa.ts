import {
  AMAZON_MARKETPLACES,
  AMAZON_SOURCE_ID,
  buildAmazonProductUrl,
  detectProductLanguage,
  offerFreshness,
  parseAmazonQuantity,
  type AmazonMarketplaceCode,
  type SellerType,
} from '../amazon.ts';
import type {
  HealthResult,
  NormalisedOffer,
  RawSourceRecord,
  ScanInput,
  SourceCapability,
  SourceConnector,
  SourcePolicy,
  ValidationResult,
} from './types.ts';

const KEEPA_API_BASE = 'https://api.keepa.com';
const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 2;

export type KeepaConfig = {
  apiKey?: string;
  defaultMarketplace?: AmazonMarketplaceCode;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type KeepaProduct = {
  asin?: string;
  title?: string;
  brand?: string;
  manufacturer?: string;
  productGroup?: string;
  packageQuantity?: number;
  eanList?: string[];
  upcList?: string[];
  lastUpdate?: number;
  lastPriceChange?: number;
  availabilityAmazon?: number;
  stats?: {
    current?: Array<number | null>;
    avg30?: Array<number | null>;
    avg90?: Array<number | null>;
    avg180?: Array<number | null>;
    minInInterval?: Array<Array<number | null> | null>;
    buyBoxIsAmazon?: boolean;
    buyBoxIsFBA?: boolean;
    buyBoxSellerId?: string;
  };
  csv?: Array<number[] | null>;
  offers?: Array<{
    sellerId?: string;
    isFBA?: boolean;
    isAmazon?: boolean;
    lastSeen?: number;
    offerCSV?: number[];
  }>;
};

export type KeepaResponse<T = KeepaProduct> = {
  timestamp?: number;
  tokensLeft?: number;
  refillRate?: number;
  refillIn?: number;
  tokenFlowReduction?: number;
  tokensConsumed?: number;
  products?: T[];
  asinList?: string[];
  dealObjects?: unknown[];
  error?: { type?: string; message?: string; code?: number };
};

export type KeepaUsageSnapshot = {
  tokensAvailable: number | null;
  tokensUsed: number;
  refillRatePerMinute: number | null;
  refillInMs: number | null;
  skippedRequests: number;
  nextSafeScanAt: string | null;
};

export type KeepaPriority =
  | 'critical_watched'
  | 'near_threshold'
  | 'recent_drop'
  | 'new_release'
  | 'discovery';

const PRIORITY_RANK: Record<KeepaPriority, number> = {
  critical_watched: 5,
  near_threshold: 4,
  recent_drop: 3,
  new_release: 2,
  discovery: 1,
};

export class KeepaTokenBudget {
  private tokensAvailable: number | null = null;
  private tokensUsed = 0;
  private refillRatePerMinute: number | null = null;
  private refillInMs: number | null = null;
  private skippedRequests = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  update(
    response: Pick<
      KeepaResponse,
      'tokensLeft' | 'tokensConsumed' | 'refillRate' | 'refillIn'
    >,
  ) {
    if (Number.isFinite(response.tokensLeft))
      this.tokensAvailable = Number(response.tokensLeft);
    if (Number.isFinite(response.tokensConsumed))
      this.tokensUsed += Number(response.tokensConsumed);
    if (Number.isFinite(response.refillRate))
      this.refillRatePerMinute = Number(response.refillRate);
    if (Number.isFinite(response.refillIn))
      this.refillInMs = Number(response.refillIn);
  }

  canSpend(cost: number, priority: KeepaPriority, reserve = 5) {
    if (this.tokensAvailable === null) return true;
    const dynamicReserve = priority === 'critical_watched' ? 0 : reserve;
    const allowed = this.tokensAvailable - cost >= dynamicReserve;
    if (!allowed) this.skippedRequests += 1;
    return allowed;
  }

  sort<T extends { priority: KeepaPriority }>(items: T[]) {
    return [...items].sort(
      (left, right) =>
        PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority],
    );
  }

  snapshot(): KeepaUsageSnapshot {
    const waitMs =
      this.tokensAvailable !== null && this.tokensAvailable <= 0
        ? Math.max(0, this.refillInMs ?? 60_000)
        : 0;
    return {
      tokensAvailable: this.tokensAvailable,
      tokensUsed: this.tokensUsed,
      refillRatePerMinute: this.refillRatePerMinute,
      refillInMs: this.refillInMs,
      skippedRequests: this.skippedRequests,
      nextSafeScanAt:
        waitMs > 0 ? new Date(this.now() + waitMs).toISOString() : null,
    };
  }
}

export class KeepaRequestError extends Error {
  readonly classification:
    | 'missing_key'
    | 'invalid_key'
    | 'token_exhausted'
    | 'rate_limited'
    | 'timeout'
    | 'upstream'
    | 'invalid_response';
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    classification:
      | 'missing_key'
      | 'invalid_key'
      | 'token_exhausted'
      | 'rate_limited'
      | 'timeout'
      | 'upstream'
      | 'invalid_response',
    status: number | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'KeepaRequestError';
    this.classification = classification;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function keepaMinutesToIso(minutes: number | undefined) {
  if (!Number.isFinite(minutes)) return null;
  return new Date((Number(minutes) + 21_564_000) * 60_000).toISOString();
}

function keepaPrice(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) >= 0
    ? Number(value) / 100
    : null;
}

function current(product: KeepaProduct, index: number) {
  return keepaPrice(product.stats?.current?.[index]);
}

function sellerType(product: KeepaProduct): SellerType {
  if (product.stats?.buyBoxIsAmazon) return 'AMAZON_DIRECT';
  if (product.stats?.buyBoxIsFBA) return 'FBA';
  if (product.stats?.buyBoxSellerId) return 'FBM';
  const offer = product.offers?.find((item) => item.isAmazon || item.isFBA);
  if (offer?.isAmazon) return 'AMAZON_DIRECT';
  if (offer?.isFBA) return 'FBA';
  return product.offers?.length ? 'FBM' : 'UNKNOWN';
}

function responseError(
  response: Response,
  body: Pick<KeepaResponse<unknown>, 'error'> | null,
) {
  const detail =
    body?.error?.message ??
    `Keepa request failed with HTTP ${response.status}.`;
  if (response.status === 402)
    return new KeepaRequestError(detail, 'invalid_key', response.status);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    return new KeepaRequestError(
      detail,
      'rate_limited',
      response.status,
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 60_000,
    );
  }
  return new KeepaRequestError(detail, 'upstream', response.status);
}

export class KeepaConnector implements SourceConnector {
  id = AMAZON_SOURCE_ID;
  name = 'Keepa / Amazon Scout';
  capabilities: SourceCapability[] = [
    'listing_search',
    'product_catalogue',
    'market_price',
    'price_history',
    'stock_status',
  ];
  readonly budget: KeepaTokenBudget;
  private readonly config: Required<
    Pick<KeepaConfig, 'timeoutMs' | 'fetchImpl' | 'now' | 'sleep'>
  > &
    Omit<KeepaConfig, 'timeoutMs' | 'fetchImpl' | 'now' | 'sleep'>;

  constructor(config: KeepaConfig = {}) {
    const now = config.now ?? Date.now;
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? 12_000,
      fetchImpl: config.fetchImpl ?? fetch,
      now,
      sleep:
        config.sleep ??
        ((milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds))),
    };
    this.budget = new KeepaTokenBudget(now);
  }

  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!this.config.apiKey?.trim()) errors.push('KEEPA_API_KEY is required');
    const defaultMarket = this.config.defaultMarketplace ?? 'NL';
    if (!AMAZON_MARKETPLACES[defaultMarket])
      errors.push('AMAZON_DEFAULT_MARKETPLACE is invalid');
    else if (AMAZON_MARKETPLACES[defaultMarket].keepaDomainId === null)
      errors.push(`Keepa does not support Amazon ${defaultMarket}`);
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.config.apiKey?.trim())
      return {
        ok: false,
        status: 'key_required',
        checkedAt: new Date(this.config.now()).toISOString(),
        detail: 'KEEPA_API_KEY is required. No Amazon HTML fallback is used.',
      };
    try {
      await this.request<never>('/token', {}, 0, 'critical_watched');
      return {
        ok: true,
        status: 'connected',
        checkedAt: new Date(this.config.now()).toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        status:
          error instanceof KeepaRequestError ? error.classification : 'error',
        checkedAt: new Date(this.config.now()).toISOString(),
        detail:
          error instanceof Error ? error.message : 'Keepa health check failed.',
      };
    }
  }

  async lookupProducts(
    asins: string[],
    marketplace: AmazonMarketplaceCode,
    priority: KeepaPriority = 'critical_watched',
  ) {
    const domain = this.domain(marketplace);
    const unique = [...new Set(asins.map((asin) => asin.toUpperCase()))].filter(
      (asin) => /^[A-Z0-9]{10}$/.test(asin),
    );
    const products: KeepaProduct[] = [];
    for (let index = 0; index < unique.length; index += MAX_BATCH_SIZE) {
      const batch = unique.slice(index, index + MAX_BATCH_SIZE);
      if (!this.budget.canSpend(batch.length, priority)) continue;
      const response = await this.request<KeepaProduct>(
        '/product',
        {
          domain: String(domain),
          asin: batch.join(','),
          stats: '180',
          history: '1',
          offers: '20',
        },
        batch.length,
        priority,
      );
      products.push(...(response.products ?? []));
    }
    return products;
  }

  async searchProducts(
    term: string,
    marketplace: AmazonMarketplaceCode,
    priority: KeepaPriority = 'discovery',
  ) {
    if (!this.budget.canSpend(10, priority)) return [];
    const response = await this.request<KeepaProduct>(
      '/search',
      {
        domain: String(this.domain(marketplace)),
        type: 'product',
        term,
        'asins-only': '1',
        history: '0',
      },
      10,
      priority,
    );
    return (
      response.asinList ??
      (response.products ?? []).flatMap((product) =>
        product.asin ? [product.asin] : [],
      )
    );
  }

  async getDeals(
    marketplace: AmazonMarketplaceCode,
    titleSearch: string,
    priority: KeepaPriority = 'discovery',
  ) {
    if (!this.budget.canSpend(5, priority)) return [];
    const response = await this.request(
      '/deal',
      {
        selection: JSON.stringify({
          domainId: this.domain(marketplace),
          priceTypes: [0],
          titleSearch,
        }),
      },
      5,
      priority,
    );
    return response.dealObjects ?? [];
  }

  async getPriceHistory(asin: string, marketplace: AmazonMarketplaceCode) {
    const [product] = await this.lookupProducts(
      [asin],
      marketplace,
      'near_threshold',
    );
    return product ? this.parsePriceHistory(product) : [];
  }

  async scan(input: ScanInput): Promise<RawSourceRecord[]> {
    const market = this.config.defaultMarketplace ?? 'DE';
    const asins = await this.searchProducts(input.query, market);
    const products = await this.lookupProducts(
      asins.slice(0, input.limit),
      market,
      'discovery',
    );
    const capturedAt = new Date(this.config.now()).toISOString();
    return products.map((payload) => ({
      sourceId: this.id,
      externalId: `${market}:${payload.asin ?? ''}`,
      capturedAt,
      payload: { marketplace: market, product: payload },
    }));
  }

  async normalise(record: RawSourceRecord): Promise<NormalisedOffer[]> {
    if (!record.payload || typeof record.payload !== 'object') return [];
    const payload = record.payload as {
      marketplace?: AmazonMarketplaceCode;
      product?: KeepaProduct;
    };
    const marketplace = payload.marketplace;
    const product = payload.product;
    if (!marketplace || !product?.asin || !product.title) return [];
    const price =
      current(product, 18) ?? current(product, 1) ?? current(product, 0);
    if (price === null) return [];
    const sourceUpdatedAt = keepaMinutesToIso(product.lastUpdate);
    return [
      {
        sourceId: this.id,
        externalId: `${marketplace}:${product.asin}`,
        sourceListingId: product.asin,
        sourceMarketplace: marketplace,
        title: product.title,
        url: buildAmazonProductUrl(product.asin, marketplace),
        sourceListingUrl: buildAmazonProductUrl(product.asin, marketplace),
        detectedAt: record.capturedAt,
        lastVerifiedAt: sourceUpdatedAt ?? record.capturedAt,
        availabilityStatus: 'available',
        itemPrice: price,
        shipping: null,
        currency: AMAZON_MARKETPLACES[marketplace].currency,
        quantity: parseAmazonQuantity(product.title).units,
        condition: 'new',
        language: detectProductLanguage(product.title),
        seller: sellerType(product),
        available: true,
      },
    ];
  }

  normaliseProduct(product: KeepaProduct, marketplace: AmazonMarketplaceCode) {
    const sourceUpdatedAt = keepaMinutesToIso(product.lastUpdate);
    const freshness = offerFreshness(sourceUpdatedAt, this.config.now());
    return {
      asin: product.asin ?? null,
      marketplace,
      title: product.title ?? 'Untitled Amazon product',
      brand: product.brand ?? null,
      manufacturer: product.manufacturer ?? null,
      productGroup: product.productGroup ?? null,
      packageQuantity: product.packageQuantity ?? null,
      ean: product.eanList?.[0] ?? null,
      gtin: product.upcList?.[0] ?? product.eanList?.[0] ?? null,
      currentPrice:
        current(product, 18) ?? current(product, 1) ?? current(product, 0),
      buyBoxPrice: current(product, 18),
      amazonPrice: current(product, 0),
      lowestNew: current(product, 1),
      sellerCount: Number.isFinite(product.stats?.current?.[11])
        ? Number(product.stats?.current?.[11])
        : null,
      offerCount: product.offers?.length ?? null,
      sellerType: sellerType(product),
      sellerName: product.stats?.buyBoxSellerId ?? null,
      sourceUpdatedAt,
      freshness: freshness.label,
      ageMinutes: freshness.ageMinutes,
      history: this.parsePriceHistory(product),
    };
  }

  getPolicy(): SourcePolicy {
    return {
      access: 'official_api',
      respectsRobots: true,
      permitsAutomatedFetch: true,
      checkoutAllowed: false,
      notes:
        'Official Keepa API only. Prices may be delayed; shipping is never assumed to be free. No Amazon HTML, login or checkout automation.',
    };
  }

  private parsePriceHistory(product: KeepaProduct) {
    const raw = product.csv?.[18] ?? product.csv?.[1] ?? product.csv?.[0] ?? [];
    const points: Array<{ at: string; price: number }> = [];
    for (let index = 0; index + 1 < raw.length; index += 2) {
      const at = keepaMinutesToIso(raw[index]);
      const price = keepaPrice(raw[index + 1]);
      if (at && price !== null) points.push({ at, price });
    }
    return points;
  }

  private domain(marketplace: AmazonMarketplaceCode) {
    const id = AMAZON_MARKETPLACES[marketplace]?.keepaDomainId;
    if (id === null || id === undefined)
      throw new KeepaRequestError(
        `Keepa does not provide the Amazon ${marketplace} marketplace.`,
        'invalid_response',
      );
    return id;
  }

  private async request<T = KeepaProduct>(
    path: string,
    parameters: Record<string, string>,
    expectedCost: number,
    priority: KeepaPriority,
  ): Promise<KeepaResponse<T>> {
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey)
      throw new KeepaRequestError('KEEPA_API_KEY is required.', 'missing_key');
    if (expectedCost > 0 && !this.budget.canSpend(expectedCost, priority))
      throw new KeepaRequestError(
        'Keepa request skipped to preserve the token reserve.',
        'token_exhausted',
      );
    const url = new URL(path, KEEPA_API_BASE);
    url.searchParams.set('key', apiKey);
    for (const [name, value] of Object.entries(parameters))
      url.searchParams.set(name, value);
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );
      try {
        const response = await this.config.fetchImpl(url, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        const body = (await response
          .json()
          .catch(() => null)) as KeepaResponse<T> | null;
        if (!response.ok) {
          const error = responseError(response, body);
          if (
            attempt < MAX_RETRIES &&
            (error.classification === 'rate_limited' ||
              (response.status >= 500 && response.status <= 599))
          ) {
            await this.config.sleep(error.retryAfterMs ?? 250 * 2 ** attempt);
            continue;
          }
          throw error;
        }
        if (!body)
          throw new KeepaRequestError(
            'Keepa returned an invalid JSON response.',
            'invalid_response',
          );
        this.budget.update(body);
        return body;
      } catch (error) {
        if (error instanceof KeepaRequestError) throw error;
        if (error instanceof Error && error.name === 'AbortError')
          throw new KeepaRequestError('Keepa request timed out.', 'timeout');
        if (attempt >= MAX_RETRIES)
          throw new KeepaRequestError(
            error instanceof Error ? error.message : 'Keepa request failed.',
            'upstream',
          );
        await this.config.sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new KeepaRequestError('Keepa request failed.', 'upstream');
  }
}

export const keepaInternals = {
  keepaMinutesToIso,
  keepaPrice,
  sellerType,
};
