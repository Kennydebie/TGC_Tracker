import {
  AMAZON_MARKETPLACES,
  amazonOpportunityScore,
  amazonRiskFlags,
  amazonRiskScore,
  buildAmazonProductUrl,
  calculatePriceHistory,
  detectProductLanguage,
  msrpStatus,
  parseAmazonQuantity,
  priceDrop,
  roundMoney,
  sellerCountChange,
  type AmazonMarketplaceCode,
  type AmazonOpportunity,
} from '../amazon.ts';
import {
  KeepaConnector,
  KeepaRequestError,
  type KeepaProduct,
} from '../connectors/keepa.ts';
import {
  listAmazonWatchTargets,
  persistAmazonOpportunity,
  persistAmazonRun,
  previousAmazonSnapshot,
} from '../repositories/amazon.ts';

export const AMAZON_DISCOVERY_TERMS = [
  'pokemon tcg',
  'pokemon elite trainer box',
  'pokemon booster box',
  'pokemon booster bundle',
  'pokemon display',
  'pokemon sealed',
  'pokemon 151',
  'pokemon prismatic evolutions',
  'pokemon destined rivals',
  'riftbound',
  'riftbound origins',
  'riftbound spiritforged',
  'riftbound booster',
  'riftbound display',
] as const;

type AmazonScoutMode = 'watched' | 'discovery';

export type AmazonScoutOptions = {
  db: D1Database;
  apiKey?: string;
  mode: AmazonScoutMode;
  markets?: AmazonMarketplaceCode[];
  connector?: KeepaConnector;
  now?: () => number;
};

function gameFromTitle(title: string) {
  if (/riftbound/i.test(title)) return 'Riftbound TCG';
  if (/pok[eé]mon/i.test(title)) return 'Pokémon TCG';
  return 'Unknown TCG';
}

async function toOpportunity(
  db: D1Database,
  connector: KeepaConnector,
  product: KeepaProduct,
  marketplace: AmazonMarketplaceCode,
  mode: AmazonScoutMode,
  now: number,
) {
  const normalized = connector.normaliseProduct(product, marketplace);
  if (!normalized.asin) return null;
  const title = normalized.title;
  const quantity = parseAmazonQuantity(title);
  const language = detectProductLanguage(title);
  const riskFlags = amazonRiskFlags(title, quantity);
  if (language === 'Unknown') riskFlags.push('language_unknown');
  const productId = `amazon:${marketplace}:${normalized.asin}`;
  const previous = await previousAmazonSnapshot(db, productId);
  const previousPrice =
    previous?.current_price_cents === null ||
    previous?.current_price_cents === undefined
      ? null
      : previous.current_price_cents / 100;
  const previousSellers = previous?.seller_count ?? null;
  const drop = priceDrop(previousPrice, normalized.currentPrice);
  const history = calculatePriceHistory(
    normalized.currentPrice,
    normalized.history,
    now,
  );
  const matchConfidence = 72;
  riskFlags.push('manual_canonical_review', 'weak_exit_evidence');
  const risk = amazonRiskScore({
    riskFlags,
    shippingStatus: 'UNKNOWN',
    sellerType: normalized.sellerType,
    freshness: normalized.freshness,
    matchConfidence,
  });
  const score = amazonOpportunityScore({
    discountToExit: 0,
    historicalPercentile: history.historicalPercentile,
    profit: 0,
    roi: 0,
    sellerType: normalized.sellerType,
    liquidity: 'Unknown',
    priceDropMagnitude: drop?.percentage ?? 0,
    sellerCountTrend: sellerCountChange(
      previousSellers,
      normalized.sellerCount,
    ),
    dataConfidence: matchConfidence,
    riskFlags,
    shippingStatus: 'UNKNOWN',
    freshness: normalized.freshness,
  });
  const opportunity: AmazonOpportunity = {
    id: productId,
    canonicalProductId: null,
    product: title,
    game: gameFromTitle(title),
    asin: normalized.asin,
    marketplace,
    sourceListingUrl: buildAmazonProductUrl(normalized.asin, marketplace),
    sellerType: normalized.sellerType,
    sellerName: normalized.sellerName,
    sellerRating: null,
    currentPrice: normalized.currentPrice,
    buyBoxPrice: normalized.buyBoxPrice,
    amazonPrice: normalized.amazonPrice,
    lowestNew: normalized.lowestNew,
    shipping: null,
    shippingStatus: 'UNKNOWN',
    mandatoryFees: 0,
    deliveredPrice: null,
    currency: 'EUR',
    quantity,
    productLanguage: language,
    sellerCount: normalized.sellerCount,
    offerCount: normalized.offerCount,
    sellerCountChange: sellerCountChange(
      previousSellers,
      normalized.sellerCount,
    ),
    availability:
      normalized.currentPrice === null ? 'unavailable' : 'available',
    history,
    previousPrice,
    priceDropPercentage: drop?.percentage ?? null,
    msrp: null,
    msrpStatus: msrpStatus(null, normalized.currentPrice),
    liquidity: 'Unknown',
    score,
    risk,
    matchConfidence,
    matchMethod: 'unmapped Keepa ASIN; manual canonical review required',
    riskFlags,
    freshness: normalized.freshness,
    sourceUpdatedAt: normalized.sourceUpdatedAt,
    fetchedAt: new Date(now).toISOString(),
    ageMinutes: normalized.ageMinutes,
    economics: {
      conservativeExit: null,
      exitEvidence: 'none',
      preferredExit: 'None',
      conservativeProfit: null,
      roi: null,
      profitPerHour: null,
      expectedHoldingDays: null,
      maximumAmazonItemPrice: null,
      maximumAmazonDeliveredPrice: null,
    },
    qualified: false,
    reviewRequired: true,
    isRestock:
      previous?.availability === 'unavailable' &&
      normalized.currentPrice !== null,
    newlyDiscovered: mode === 'discovery' && !previous,
    watched: mode === 'watched',
    dataMode: 'production',
  };
  return {
    opportunity,
    metadata: {
      provider: 'amazon_keepa',
      title,
      brand: normalized.brand,
      manufacturer: normalized.manufacturer,
      productGroup: normalized.productGroup,
      packageQuantity: normalized.packageQuantity,
      ean: normalized.ean,
      gtin: normalized.gtin,
    },
  };
}

function classify(error: unknown) {
  if (error instanceof KeepaRequestError)
    return {
      status: error.classification,
      code: error.classification,
      reason: error.message,
    };
  return {
    status: 'error',
    code: 'unexpected_error',
    reason: error instanceof Error ? error.message : 'Amazon Scout failed.',
  };
}

export async function runAmazonScout(options: AmazonScoutOptions) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const id = `amazon:${options.mode}:${crypto.randomUUID()}`;
  const markets = (options.markets ?? ['DE', 'FR', 'IT', 'ES']).filter(
    (market) => AMAZON_MARKETPLACES[market]?.keepaDomainId !== null,
  );
  const connector =
    options.connector ??
    new KeepaConnector({
      apiKey: options.apiKey,
      defaultMarketplace: markets[0] ?? 'DE',
      now,
    });
  if (!options.apiKey?.trim() && !options.connector) {
    const finishedAt = now();
    const usage = connector.budget.snapshot();
    await persistAmazonRun(options.db, {
      id,
      mode: options.mode,
      status: 'key_required',
      startedAt,
      finishedAt,
      marketplaces: markets,
      productsChecked: 0,
      priceChanges: 0,
      newProducts: 0,
      qualified: 0,
      errors: 0,
      errorCode: 'missing_key',
      reason:
        'KEEPA_API_KEY is required. No Amazon HTML fallback was attempted.',
      usage,
    });
    return { id, status: 'key_required' as const, productsChecked: 0, usage };
  }
  let productsChecked = 0;
  let priceChanges = 0;
  let newProducts = 0;
  let qualified = 0;
  let errors = 0;
  try {
    const health = await connector.healthCheck();
    if (!health.ok)
      throw new KeepaRequestError(
        health.detail ?? 'Keepa authentication failed.',
        health.status === 'invalid_key' ? 'invalid_key' : 'upstream',
      );
    const work: Array<{
      product: KeepaProduct;
      marketplace: AmazonMarketplaceCode;
    }> = [];
    if (options.mode === 'watched') {
      const targets = await listAmazonWatchTargets(options.db);
      for (const marketplace of markets) {
        const asins = targets
          .filter((target) => target.marketplace === marketplace)
          .map((target) => target.asin);
        if (!asins.length) continue;
        const products = await connector.lookupProducts(
          asins,
          marketplace,
          'critical_watched',
        );
        work.push(...products.map((product) => ({ product, marketplace })));
      }
    } else {
      const termIndex =
        Math.floor(startedAt / (180 * 60_000)) % AMAZON_DISCOVERY_TERMS.length;
      const term = AMAZON_DISCOVERY_TERMS[termIndex];
      for (const marketplace of markets) {
        const asins = await connector.searchProducts(
          term,
          marketplace,
          'discovery',
        );
        const products = await connector.lookupProducts(
          asins.slice(0, 10),
          marketplace,
          'discovery',
        );
        work.push(...products.map((product) => ({ product, marketplace })));
      }
    }
    for (const item of work) {
      const prepared = await toOpportunity(
        options.db,
        connector,
        item.product,
        item.marketplace,
        options.mode,
        now(),
      );
      if (!prepared) continue;
      const persisted = await persistAmazonOpportunity(
        options.db,
        prepared.opportunity,
        prepared.metadata,
      );
      productsChecked += 1;
      priceChanges += persisted.eventCount;
      if (persisted.isNew) newProducts += 1;
      if (prepared.opportunity.qualified) qualified += 1;
    }
    const finishedAt = now();
    const usage = connector.budget.snapshot();
    await persistAmazonRun(options.db, {
      id,
      mode: options.mode,
      status: 'connected',
      startedAt,
      finishedAt,
      marketplaces: markets,
      productsChecked,
      priceChanges,
      newProducts,
      qualified,
      errors,
      errorCode: null,
      reason: null,
      usage,
    });
    return {
      id,
      status: 'connected' as const,
      productsChecked,
      priceChanges,
      newProducts,
      qualified,
      usage,
    };
  } catch (error) {
    errors += 1;
    const failure = classify(error);
    const finishedAt = now();
    const usage = connector.budget.snapshot();
    await persistAmazonRun(options.db, {
      id,
      mode: options.mode,
      status: failure.status,
      startedAt,
      finishedAt,
      marketplaces: markets,
      productsChecked,
      priceChanges,
      newProducts,
      qualified,
      errors,
      errorCode: failure.code,
      reason: failure.reason,
      usage,
    });
    return {
      id,
      status: failure.status,
      reason: failure.reason,
      productsChecked,
      usage,
    };
  }
}

export const amazonScoutInternals = {
  toOpportunity,
  gameFromTitle,
  classify,
  roundMoney,
};
