export const AMAZON_SOURCE_ID = 'amazon-keepa';
export const AMAZON_WATCHED_INTERVAL_MINUTES = 15;
export const AMAZON_DISCOVERY_INTERVAL_MINUTES = 180;

export type AmazonMarketplaceCode =
  | 'NL'
  | 'DE'
  | 'BE'
  | 'FR'
  | 'IT'
  | 'ES'
  | 'UK'
  | 'US';

export type AmazonMarketplace = {
  code: AmazonMarketplaceCode;
  hostname: string;
  keepaDomainId: number | null;
  currency: 'EUR' | 'GBP' | 'USD';
  language: string;
  country: string;
  label: string;
  eu: boolean;
  shipsToNetherlands: 'supported' | 'seller_dependent' | 'unknown';
  vatAssumption: string;
};

export const AMAZON_MARKETPLACES: Record<
  AmazonMarketplaceCode,
  AmazonMarketplace
> = {
  NL: {
    code: 'NL',
    hostname: 'www.amazon.nl',
    keepaDomainId: null,
    currency: 'EUR',
    language: 'Dutch',
    country: 'Netherlands',
    label: 'Amazon NL',
    eu: true,
    shipsToNetherlands: 'supported',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  DE: {
    code: 'DE',
    hostname: 'www.amazon.de',
    keepaDomainId: 3,
    currency: 'EUR',
    language: 'German',
    country: 'Germany',
    label: 'Amazon DE',
    eu: true,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  BE: {
    code: 'BE',
    hostname: 'www.amazon.com.be',
    keepaDomainId: null,
    currency: 'EUR',
    language: 'Dutch / French',
    country: 'Belgium',
    label: 'Amazon BE',
    eu: true,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  FR: {
    code: 'FR',
    hostname: 'www.amazon.fr',
    keepaDomainId: 4,
    currency: 'EUR',
    language: 'French',
    country: 'France',
    label: 'Amazon FR',
    eu: true,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  IT: {
    code: 'IT',
    hostname: 'www.amazon.it',
    keepaDomainId: 8,
    currency: 'EUR',
    language: 'Italian',
    country: 'Italy',
    label: 'Amazon IT',
    eu: true,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  ES: {
    code: 'ES',
    hostname: 'www.amazon.es',
    keepaDomainId: 9,
    currency: 'EUR',
    language: 'Spanish',
    country: 'Spain',
    label: 'Amazon ES',
    eu: true,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'EU consumer price; no import duty assumed.',
  },
  UK: {
    code: 'UK',
    hostname: 'www.amazon.co.uk',
    keepaDomainId: 2,
    currency: 'GBP',
    language: 'English',
    country: 'United Kingdom',
    label: 'Amazon UK',
    eu: false,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'Import/VAT treatment required before economics.',
  },
  US: {
    code: 'US',
    hostname: 'www.amazon.com',
    keepaDomainId: 1,
    currency: 'USD',
    language: 'English',
    country: 'United States',
    label: 'Amazon US',
    eu: false,
    shipsToNetherlands: 'seller_dependent',
    vatAssumption: 'Import/VAT treatment required before economics.',
  },
};

export const DEFAULT_AMAZON_MARKETS: AmazonMarketplaceCode[] = [
  'NL',
  'DE',
  'BE',
  'FR',
  'IT',
  'ES',
];

export const KEEPA_ENABLED_EU_MARKETS = DEFAULT_AMAZON_MARKETS.filter(
  (code) => AMAZON_MARKETPLACES[code].keepaDomainId !== null,
);

export type ShippingStatus = 'CONFIRMED' | 'ESTIMATED' | 'UNKNOWN';
export type SellerType = 'AMAZON_DIRECT' | 'FBA' | 'FBM' | 'UNKNOWN';
export type Freshness = 'Fresh' | 'Recent' | 'Stale' | 'Unknown';
export type AmazonDataMode = 'production' | 'fixture' | 'manual';
export type AmazonSourceState =
  | 'connected'
  | 'key_required'
  | 'invalid_key'
  | 'token_limited'
  | 'rate_limited'
  | 'error';

export type QuantityNormalisation = {
  units: number | null;
  packCount: number | null;
  boxCount: number | null;
  caseCount: number | null;
  bundleCount: number | null;
  canonicalUnit: 'pack' | 'box' | 'case' | 'bundle' | 'etb' | 'unknown';
  ambiguous: boolean;
};

export type PriceHistoryPoint = { at: string; price: number };
export type AmazonHistory = {
  low30d: number | null;
  median30d: number | null;
  low90d: number | null;
  median90d: number | null;
  low180d: number | null;
  median180d: number | null;
  allTimeLow: number | null;
  historicalPercentile: number | null;
  points: PriceHistoryPoint[];
};

export type AmazonEconomics = {
  conservativeExit: number | null;
  exitEvidence: 'cardmarket_sold' | 'ebay_sold' | 'modelled_fixture' | 'none';
  preferredExit: 'Cardmarket' | 'eBay' | 'None';
  conservativeProfit: number | null;
  roi: number | null;
  profitPerHour: number | null;
  expectedHoldingDays: number | null;
  maximumAmazonItemPrice: number | null;
  maximumAmazonDeliveredPrice: number | null;
};

export type AmazonOpportunity = {
  id: string;
  canonicalProductId: string | null;
  product: string;
  game: string;
  asin: string;
  marketplace: AmazonMarketplaceCode;
  sourceListingUrl: string;
  sellerType: SellerType;
  sellerName: string | null;
  sellerRating: number | null;
  currentPrice: number | null;
  buyBoxPrice: number | null;
  amazonPrice: number | null;
  lowestNew: number | null;
  shipping: number | null;
  shippingStatus: ShippingStatus;
  mandatoryFees: number;
  deliveredPrice: number | null;
  currency: 'EUR';
  quantity: QuantityNormalisation;
  productLanguage: string;
  sellerCount: number | null;
  offerCount: number | null;
  sellerCountChange: number | null;
  availability: 'available' | 'unavailable' | 'unknown';
  history: AmazonHistory;
  previousPrice: number | null;
  priceDropPercentage: number | null;
  msrp: number | null;
  msrpStatus: string;
  liquidity: 'High' | 'Medium' | 'Low' | 'Unknown';
  score: number;
  risk: number;
  matchConfidence: number;
  matchMethod: string;
  riskFlags: string[];
  freshness: Freshness;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  ageMinutes: number | null;
  economics: AmazonEconomics;
  qualified: boolean;
  reviewRequired: boolean;
  isRestock: boolean;
  newlyDiscovered: boolean;
  watched: boolean;
  dataMode: AmazonDataMode;
};

export type AmazonDashboard = {
  sourceState: AmazonSourceState;
  apiConnected: boolean;
  dataMode: 'production' | 'fixture';
  keyAvailable: boolean;
  reason: string | null;
  markets: AmazonMarketplaceCode[];
  keepaMarkets: AmazonMarketplaceCode[];
  unsupportedKeepaMarkets: AmazonMarketplaceCode[];
  watchedIntervalMinutes: number;
  discoveryIntervalMinutes: number;
  lastScanAt: string | null;
  nextWatchedScanAt: string | null;
  nextDiscoveryScanAt: string | null;
  tokens: {
    available: number | null;
    usedThisScan: number;
    refillRatePerMinute: number | null;
    nextSafeScanAt: string | null;
    skipped: number;
  };
  metrics: {
    productsMonitored: number;
    productsChecked: number;
    priceChanges: number;
    priceDrops: number;
    newProducts: number;
    qualified: number;
    errors: number;
  };
  opportunities: AmazonOpportunity[];
};

const ASIN = /^[A-Z0-9]{10}$/;

export function marketplaceFromHostname(
  hostname: string,
): AmazonMarketplaceCode | null {
  const normalized = hostname.toLowerCase().replace(/^www\./, '');
  const entry = Object.values(AMAZON_MARKETPLACES).find(
    (market) => market.hostname.replace(/^www\./, '') === normalized,
  );
  return entry?.code ?? null;
}

export function extractAmazonAsin(
  input: string,
): { asin: string; marketplace: AmazonMarketplaceCode } | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const marketplace = marketplaceFromHostname(url.hostname);
  if (!marketplace) return null;
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = url.pathname.match(pattern);
    const asin = match?.[1]?.toUpperCase();
    if (asin && ASIN.test(asin)) return { asin, marketplace };
  }
  return null;
}

export function buildAmazonProductUrl(
  asin: string,
  marketplace: AmazonMarketplaceCode,
) {
  const normalized = asin.toUpperCase();
  if (!ASIN.test(normalized)) throw new Error('Invalid Amazon ASIN.');
  const market = AMAZON_MARKETPLACES[marketplace];
  if (!market) throw new Error('Unsupported Amazon marketplace.');
  return `https://${market.hostname}/dp/${normalized}`;
}

export function isAllowedAmazonProductUrl(input: string) {
  return extractAmazonAsin(input) !== null;
}

export function parseAmazonQuantity(title: string): QuantityNormalisation {
  const value = title.toLowerCase();
  const number = (pattern: RegExp) => {
    const match = value.match(pattern);
    return match ? Number(match[1]) : null;
  };
  const caseCount = number(
    /(?:case|caisse|caja|karton)\s*(?:of|de|mit|x)?\s*(\d+)/i,
  );
  const packCount =
    number(/(\d+)\s*[- ]?(?:booster\s*)?(?:packs?|bustine|paquets?)/i) ??
    number(/(\d+)\s+boosters?\b(?!\s*(?:bundle|box|display))/i) ??
    number(/(?:pack|lot|bundle)\s*(?:of|de|mit|x)\s*(\d+)/i);
  const boxCount =
    number(/(\d+)\s*(?:booster\s*)?(?:boxes|box|displays?)/i) ??
    number(/(?:boxes|box|displays?)\s*(?:of|de|mit|x)\s*(\d+)/i);
  const bundleCount = number(/(\d+)\s*(?:bundles?|lots?)/i);
  const isEtb = /elite trainer box|\betb\b/i.test(value);
  const isBoosterBox = /booster (?:box|display)|display.*booster/i.test(value);
  const singleBooster = /single|1\s*(?:booster\s*)?(?:pack|booster)\b/i.test(
    value,
  );
  const ambiguousTerms =
    /mystery|random|assortment|case only|display only|empty|storage|deck box|binder/i.test(
      value,
    );
  const signals = [caseCount, packCount, boxCount, bundleCount].filter(
    (item) => item !== null,
  );
  let canonicalUnit: QuantityNormalisation['canonicalUnit'] = 'unknown';
  if (caseCount) canonicalUnit = 'case';
  else if (isEtb) canonicalUnit = 'etb';
  else if (isBoosterBox || boxCount) canonicalUnit = 'box';
  else if (bundleCount) canonicalUnit = 'bundle';
  else if (packCount || singleBooster) canonicalUnit = 'pack';
  const units =
    caseCount ??
    boxCount ??
    bundleCount ??
    (isBoosterBox ? 1 : null) ??
    packCount ??
    (isEtb || singleBooster ? 1 : null);
  return {
    units,
    packCount,
    boxCount,
    caseCount,
    bundleCount,
    canonicalUnit,
    ambiguous:
      ambiguousTerms || signals.length > 1 || canonicalUnit === 'unknown',
  };
}

export function detectProductLanguage(title: string) {
  const value = title.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['Japanese', /japanese|japanisch|japonais|giapponese|japon[eé]s|日本語/],
    ['German', /german|deutsch|deutsche ausgabe/],
    ['French', /french|fran[cç]ais|version fran[cç]aise/],
    ['Italian', /italian|italiano|edizione italiana/],
    ['Spanish', /spanish|espa[nñ]ol|edici[oó]n espa[nñ]ola/],
    ['Dutch', /dutch|nederlands|nederlandse versie/],
    ['English', /english|englisch|anglais|inglese|ingl[eé]s/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? 'Unknown';
}

export function amazonRiskFlags(
  title: string,
  quantity: QuantityNormalisation,
) {
  const value = title.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    [
      'empty_or_accessory',
      /empty box|storage box|deck box|binder|sleeves?|case only|display only/,
    ],
    ['proxy_or_replica', /proxy|custom cards?|replica|reproduction/],
    ['code_product', /digital code|code cards?/],
    ['loose_or_single_pack', /single booster|loose booster/],
    ['mystery_or_repacked', /mystery|random assortment|repacked|resealed/],
    ['condition_risk', /used|damaged|opened/],
  ];
  const flags = rules
    .filter(([, pattern]) => pattern.test(value))
    .map(([flag]) => flag);
  if (quantity.ambiguous) flags.push('quantity_ambiguous');
  return [...new Set(flags)];
}

export function deliveredPrice(input: {
  itemPrice: number | null;
  shipping: number | null;
  shippingStatus: ShippingStatus;
  mandatoryFees?: number;
  fxCost?: number;
  importCost?: number;
  otherMandatoryCost?: number;
}) {
  if (input.itemPrice === null || input.shippingStatus === 'UNKNOWN')
    return null;
  if (input.shipping === null) return null;
  return roundMoney(
    input.itemPrice +
      input.shipping +
      (input.mandatoryFees ?? 0) +
      (input.fxCost ?? 0) +
      (input.importCost ?? 0) +
      (input.otherMandatoryCost ?? 0),
  );
}

export function convertCurrency(
  amount: number,
  rateToEur: number,
  fxFeeRate = 0,
) {
  return roundMoney(amount * rateToEur * (1 + fxFeeRate));
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function historicalPercentile(current: number, history: number[]) {
  if (!history.length) return null;
  const atOrBelow = history.filter((price) => price <= current).length;
  return Math.round((atOrBelow / history.length) * 100);
}

export function calculatePriceHistory(
  current: number | null,
  points: PriceHistoryPoint[],
  now = Date.now(),
): AmazonHistory {
  const pricesSince = (days: number) =>
    points
      .filter(
        (point) => now - new Date(point.at).valueOf() <= days * 86_400_000,
      )
      .map((point) => point.price)
      .filter((price) => Number.isFinite(price) && price > 0);
  const p30 = pricesSince(30);
  const p90 = pricesSince(90);
  const p180 = pricesSince(180);
  const all = points.map((point) => point.price).filter((price) => price > 0);
  return {
    low30d: p30.length ? Math.min(...p30) : null,
    median30d: median(p30),
    low90d: p90.length ? Math.min(...p90) : null,
    median90d: median(p90),
    low180d: p180.length ? Math.min(...p180) : null,
    median180d: median(p180),
    allTimeLow: all.length ? Math.min(...all) : null,
    historicalPercentile:
      current === null ? null : historicalPercentile(current, p180),
    points,
  };
}

export function priceDrop(previous: number | null, current: number | null) {
  if (
    previous === null ||
    current === null ||
    previous <= 0 ||
    current >= previous
  )
    return null;
  return {
    amount: roundMoney(previous - current),
    percentage: (previous - current) / previous,
  };
}

export function sellerCountChange(
  previous: number | null,
  current: number | null,
) {
  if (previous === null || current === null) return null;
  return current - previous;
}

export function offerFreshness(
  sourceUpdatedAt: string | null,
  now = Date.now(),
) {
  if (!sourceUpdatedAt) return { label: 'Unknown' as const, ageMinutes: null };
  const ageMinutes = Math.max(
    0,
    Math.round((now - new Date(sourceUpdatedAt).valueOf()) / 60_000),
  );
  const label: Freshness =
    ageMinutes <= 15 ? 'Fresh' : ageMinutes <= 60 ? 'Recent' : 'Stale';
  return { label, ageMinutes };
}

export function maximumAmazonPrices(input: {
  conservativeNetExit: number;
  nonItemAcquisitionCosts: number;
  requiredProfit: number;
}) {
  const maximumDeliveredPrice = Math.max(
    0,
    input.conservativeNetExit - input.requiredProfit,
  );
  return {
    maximumAmazonDeliveredPrice: roundMoney(maximumDeliveredPrice),
    maximumAmazonItemPrice: roundMoney(
      Math.max(0, maximumDeliveredPrice - input.nonItemAcquisitionCosts),
    ),
  };
}

export type AmazonScoreInput = {
  discountToExit: number;
  historicalPercentile: number | null;
  profit: number;
  roi: number;
  sellerType: SellerType;
  liquidity: AmazonOpportunity['liquidity'];
  priceDropMagnitude: number;
  sellerCountTrend: number | null;
  dataConfidence: number;
  riskFlags: string[];
  shippingStatus: ShippingStatus;
  freshness: Freshness;
};

export function amazonOpportunityScore(input: AmazonScoreInput) {
  const sellerQuality = {
    AMAZON_DIRECT: 100,
    FBA: 85,
    FBM: 55,
    UNKNOWN: 20,
  }[input.sellerType];
  const liquidity = { High: 100, Medium: 65, Low: 30, Unknown: 20 }[
    input.liquidity
  ];
  const percentileScore =
    input.historicalPercentile === null
      ? 20
      : 100 - Math.min(100, input.historicalPercentile);
  let score =
    Math.min(100, Math.max(0, input.discountToExit * 250)) * 0.2 +
    percentileScore * 0.15 +
    Math.min(100, Math.max(0, input.profit / 0.5)) * 0.15 +
    Math.min(100, Math.max(0, input.roi * 200)) * 0.15 +
    sellerQuality * 0.1 +
    liquidity * 0.1 +
    Math.min(100, input.priceDropMagnitude * 300) * 0.05 +
    (input.sellerCountTrend !== null && input.sellerCountTrend < 0 ? 80 : 35) *
      0.05 +
    Math.max(0, Math.min(100, input.dataConfidence)) * 0.05;
  const penalties: Record<string, number> = {
    quantity_ambiguous: 22,
    foreign_language: 12,
    weak_exit_evidence: 15,
    low_match_confidence: 15,
    empty_or_accessory: 40,
    proxy_or_replica: 45,
    mystery_or_repacked: 40,
    condition_risk: 30,
  };
  for (const flag of new Set(input.riskFlags)) score -= penalties[flag] ?? 5;
  if (input.shippingStatus === 'UNKNOWN') score -= 18;
  if (input.sellerType === 'UNKNOWN') score -= 12;
  if (input.freshness === 'Stale' || input.freshness === 'Unknown') score -= 18;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function amazonRiskScore(input: {
  riskFlags: string[];
  shippingStatus: ShippingStatus;
  sellerType: SellerType;
  freshness: Freshness;
  matchConfidence: number;
}) {
  let risk = input.riskFlags.length * 9;
  if (input.shippingStatus === 'UNKNOWN') risk += 22;
  if (input.sellerType === 'FBM') risk += 12;
  if (input.sellerType === 'UNKNOWN') risk += 22;
  if (input.freshness === 'Stale') risk += 18;
  if (input.freshness === 'Unknown') risk += 25;
  risk += Math.max(0, 90 - input.matchConfidence);
  return Math.min(100, Math.round(risk));
}

export function qualifiesAmazonQuickFlip(opportunity: AmazonOpportunity) {
  const economics = opportunity.economics;
  return (
    opportunity.matchConfidence >= 90 &&
    opportunity.sellerType !== 'UNKNOWN' &&
    opportunity.shippingStatus !== 'UNKNOWN' &&
    economics.exitEvidence !== 'none' &&
    (economics.conservativeProfit ?? -Infinity) >= 25 &&
    (economics.roi ?? -Infinity) >= 0.2 &&
    (economics.profitPerHour ?? -Infinity) >= 20 &&
    (economics.expectedHoldingDays ?? Infinity) <= 90 &&
    opportunity.risk < 60 &&
    opportunity.freshness !== 'Stale' &&
    opportunity.freshness !== 'Unknown'
  );
}

export function msrpStatus(msrp: number | null, current: number | null) {
  if (msrp === null || current === null || msrp <= 0) return 'UNKNOWN MSRP';
  const difference = (current - msrp) / msrp;
  if (Math.abs(difference) < 0.005) return 'AT MSRP';
  return `${Math.abs(difference * 100).toFixed(1)}% ${difference < 0 ? 'BELOW' : 'ABOVE'} MSRP`;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
