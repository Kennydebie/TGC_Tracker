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
import { validateSourceListingUrl } from '../listing-url.ts';

type EbayConfig = {
  clientId?: string;
  clientSecret?: string;
  marketplace?: string;
};

export class EbayBrowseConnector implements SourceConnector {
  id = 'ebay';
  name = 'eBay Browse';
  capabilities: SourceCapability[] = [
    'listing_search',
    'listing_details',
    'market_price',
  ];
  private accessToken: { value: string; expiresAt: number } | null = null;
  private readonly config: EbayConfig;

  constructor(config: EbayConfig) {
    this.config = config;
  }

  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!this.config.clientId) errors.push('EBAY_CLIENT_ID is required');
    if (!this.config.clientSecret)
      errors.push('EBAY_CLIENT_SECRET is required');
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<HealthResult> {
    const validation = await this.validateConfig();
    if (!validation.valid)
      return {
        ok: false,
        status: 'credentials_required',
        checkedAt: new Date().toISOString(),
        detail: validation.errors.join('; '),
      };
    try {
      await this.token();
      return {
        ok: true,
        status: 'authenticated',
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        status: 'authentication_failed',
        checkedAt: new Date().toISOString(),
        detail:
          error instanceof Error
            ? error.message
            : 'Unknown authentication error',
      };
    }
  }

  async scan(input: ScanInput): Promise<RawSourceRecord[]> {
    const validation = await this.validateConfig();
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const url = new URL(
      'https://api.ebay.com/buy/browse/v1/item_summary/search',
    );
    url.searchParams.set('q', input.query);
    url.searchParams.set(
      'limit',
      String(Math.min(200, Math.max(1, input.limit))),
    );
    if (input.cursor) url.searchParams.set('offset', input.cursor);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'X-EBAY-C-MARKETPLACE-ID': this.config.marketplace ?? 'EBAY_NL',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok)
      throw new Error(`eBay Browse request failed with ${response.status}`);
    const body = (await response.json()) as {
      itemSummaries?: Record<string, unknown>[];
    };
    return (body.itemSummaries ?? []).map((payload) => ({
      sourceId: this.id,
      externalId:
        typeof payload.itemId === 'string' || typeof payload.itemId === 'number'
          ? `${payload.itemId}`
          : '',
      capturedAt: new Date().toISOString(),
      payload,
    }));
  }

  async normalise(record: RawSourceRecord): Promise<NormalisedOffer[]> {
    if (!record.payload || typeof record.payload !== 'object') return [];
    const item = record.payload as Record<string, unknown>;
    const price = item.price as Record<string, unknown> | undefined;
    const shipping = Array.isArray(item.shippingOptions)
      ? (item.shippingOptions[0] as Record<string, unknown> | undefined)
      : undefined;
    const shippingCost = shipping?.shippingCost as
      | Record<string, unknown>
      | undefined;
    if (
      !record.externalId ||
      typeof item.title !== 'string' ||
      typeof item.itemWebUrl !== 'string' ||
      !price ||
      typeof price.value !== 'string'
    )
      return [];
    const listingUrl = validateSourceListingUrl('ebay', item.itemWebUrl);
    return [
      {
        sourceId: this.id,
        externalId: record.externalId,
        sourceListingId: record.externalId,
        sourceMarketplace: this.id,
        title: item.title,
        url: listingUrl.toString(),
        sourceListingUrl: listingUrl.toString(),
        detectedAt: record.capturedAt,
        lastVerifiedAt: new Date().toISOString(),
        availabilityStatus: 'available',
        itemPrice: Number(price.value),
        shipping:
          typeof shippingCost?.value === 'string'
            ? Number(shippingCost.value)
            : null,
        currency: typeof price.currency === 'string' ? price.currency : 'EUR',
        quantity: null,
        condition: typeof item.condition === 'string' ? item.condition : null,
        language: null,
        seller:
          typeof (item.seller as Record<string, unknown> | undefined)
            ?.username === 'string'
            ? String((item.seller as Record<string, unknown>).username)
            : null,
        available: true,
      },
    ];
  }

  async getListing(sourceListingId: string): Promise<NormalisedOffer | null> {
    const validation = await this.validateConfig();
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const safeId = encodeURIComponent(sourceListingId);
    const response = await fetch(
      `https://api.ebay.com/buy/browse/v1/item/${safeId}`,
      {
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'X-EBAY-C-MARKETPLACE-ID': this.config.marketplace ?? 'EBAY_NL',
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `eBay Browse item request failed with ${response.status}`,
      );
    const capturedAt = new Date().toISOString();
    const offers = await this.normalise({
      sourceId: this.id,
      externalId: sourceListingId,
      capturedAt,
      payload: await response.json(),
    });
    return offers[0] ?? null;
  }

  getPolicy(): SourcePolicy {
    return {
      access: 'official_api',
      respectsRobots: true,
      permitsAutomatedFetch: true,
      checkoutAllowed: false,
      notes:
        'Official Browse API for active listings. No Order API dependency; active asks are not sold evidence.',
    };
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000)
      return this.accessToken.value;
    if (!this.config.clientId || !this.config.clientSecret)
      throw new Error('eBay credentials are missing');
    const authorization = btoa(
      `${this.config.clientId}:${this.config.clientSecret}`,
    );
    const response = await fetch(
      'https://api.ebay.com/identity/v1/oauth2/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(`eBay OAuth failed with ${response.status}`);
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }
}
