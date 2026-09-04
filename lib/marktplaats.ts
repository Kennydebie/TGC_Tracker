import { calculateEconomics, type DealEconomics } from './domain.ts';

export const MARKTPLAATS_SOURCE_ID = 'marktplaats-public' as const;
export const MARKTPLAATS_ACCESS_MODE = 'public_monitor' as const;
export const MARKTPLAATS_MIN_SCAN_INTERVAL_MINUTES = 15;
export const MARKTPLAATS_MAX_QUERIES = 20;
export const MARKTPLAATS_MAX_RESULTS_PER_QUERY = 50;
export const MARKTPLAATS_BLOCK_PAUSE_HOURS = 6;

export const MARKTPLAATS_EXACT_QUERIES = [
  'pokemon prismatic evolutions etb',
  'pokemon 151 booster bundle',
  'pokemon destined rivals booster box',
  'pokemon booster box',
  'pokemon sealed',
  'riftbound origins display',
  'riftbound spiritforged',
  'riftbound booster',
] as const;

export const MARKTPLAATS_UGLY_QUERIES = [
  'pokemon kaarten',
  'oude pokemon kaarten',
  'pokemon map',
  'pokemon collectie',
  'pokemon verzameling',
  'pokemon partij',
  'kaarten zolder',
  'oude kaarten map',
  'pokemon doos',
  'pokemon spullen',
  'pokemon holo',
  'pokemon lot',
] as const;

export const MARKTPLAATS_DEFAULT_QUERIES = [
  ...MARKTPLAATS_EXACT_QUERIES,
  ...MARKTPLAATS_UGLY_QUERIES,
].slice(0, MARKTPLAATS_MAX_QUERIES);

export type MarktplaatsQueryKind = 'exact' | 'ugly';
export type MarktplaatsSourceState =
  | 'healthy'
  | 'paused'
  | 'blocked'
  | 'parser_review_required'
  | 'awaiting_first_scan';

export type MarktplaatsSearchInput = {
  query: string;
  category?: string;
  minimumPrice?: number;
  maximumPrice?: number;
  postcode?: string;
  distanceKm?: number;
};

export type MarktplaatsParsedListing = {
  sourceListingId: string;
  sourceListingUrl: string;
  title: string;
  price: number | null;
  location: string | null;
  seller: string | null;
  snippet: string | null;
  thumbnailUrl: string | null;
  listingTimestampText: string | null;
  delivery: string | null;
  sponsored: boolean;
  foundByQueries: string[];
};

export type MarktplaatsTitleAssessment = {
  game: 'Pokémon' | 'Riftbound' | 'Unknown';
  productType: string;
  sealedStatus: 'sealed' | 'open' | 'unknown';
  quantity: number | null;
  riskFlags: string[];
  reviewRequired: boolean;
  matchConfidence: number;
};

export type PickupCostInput = {
  oneWayDistanceKm: number;
  fuelCostPerKm?: number;
  parking?: number;
  tolls?: number;
  averageSpeedKmH?: number;
  timeValuePerHour?: number;
};

export type PickupCost = {
  oneWayDistanceKm: number;
  roundTripDistanceKm: number;
  travelTimeHours: number;
  fuelCost: number;
  parking: number;
  tolls: number;
  travelTimeCost: number;
  total: number;
};

export type MarktplaatsDashboardListing = {
  id: string;
  sourceListingId: string;
  sourceListingUrl: string;
  title: string;
  price: number | null;
  location: string | null;
  seller: string | null;
  snippet: string | null;
  thumbnailUrl: string | null;
  listingTimestampText: string | null;
  delivery: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  availability: 'active' | 'possibly_unavailable' | 'unavailable';
  foundByQueries: string[];
  assessment: MarktplaatsTitleAssessment;
  distanceKm: number | null;
  pickupCost: PickupCost | null;
  economics: DealEconomics | null;
  score: number;
  riskScore: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'REVIEW';
  isNew: boolean;
  priceDrop: { from: number; to: number; percentage: number } | null;
};

export type MarktplaatsDashboard = {
  accessMode: 'public_monitor';
  intervalMinutes: number;
  status: MarktplaatsSourceState;
  reason: string | null;
  lastScanAt: string | null;
  nextScanAt: string | null;
  automaticRetryAt: string | null;
  parserConfidence: number | null;
  metrics: {
    queries: number;
    pagesFetched: number;
    listingsParsed: number;
    newListings: number;
    qualified: number;
    review: number;
    duplicates: number;
    priceDrops: number;
    alerts: number;
    errors: number;
  };
  listings: MarktplaatsDashboardListing[];
};

export type MarktplaatsBlockCode =
  | 'http_403'
  | 'http_429'
  | 'captcha'
  | 'challenge'
  | 'login_redirect'
  | 'empty_anomaly';

export class MarktplaatsAccessError extends Error {
  readonly code: MarktplaatsBlockCode;
  readonly status?: number;

  constructor(code: MarktplaatsBlockCode, message: string, status?: number) {
    super(message);
    this.name = 'MarktplaatsAccessError';
    this.code = code;
    this.status = status;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function marktplaatsScanIntervalMinutes(value?: string | number | null) {
  const parsed = Number(value ?? MARKTPLAATS_MIN_SCAN_INTERVAL_MINUTES);
  if (!Number.isFinite(parsed)) return MARKTPLAATS_MIN_SCAN_INTERVAL_MINUTES;
  return Math.max(MARKTPLAATS_MIN_SCAN_INTERVAL_MINUTES, Math.round(parsed));
}

export function configuredMarktplaatsQueries(value?: string | null) {
  const configured = value
    ?.split(',')
    .map((query) => query.trim())
    .filter(Boolean);
  return (configured?.length ? configured : MARKTPLAATS_DEFAULT_QUERIES).slice(
    0,
    MARKTPLAATS_MAX_QUERIES,
  );
}

export function marktplaatsQueryKind(query: string): MarktplaatsQueryKind {
  return MARKTPLAATS_EXACT_QUERIES.includes(
    query as (typeof MARKTPLAATS_EXACT_QUERIES)[number],
  )
    ? 'exact'
    : 'ugly';
}

export function buildMarktplaatsSearchUrl(input: MarktplaatsSearchInput) {
  const query = input.query.trim().slice(0, 120);
  if (!query) throw new Error('A Marktplaats search query is required.');
  const category = (
    input.category ?? 'hobby-en-vrije-tijd/verzamelkaartspellen-pokemon'
  )
    .replaceAll(/[^a-z0-9/-]/gi, '')
    .replaceAll(/\.{2,}/g, '');
  const encodedQuery = encodeURIComponent(query).replaceAll('%20', '%2B');
  const url = new URL(
    `/l/${category}/q/${encodedQuery}/`,
    'https://www.marktplaats.nl',
  );
  if (Number.isFinite(input.minimumPrice))
    url.searchParams.set(
      'PriceCentsFrom',
      String(Math.max(0, Math.round(Number(input.minimumPrice) * 100))),
    );
  if (Number.isFinite(input.maximumPrice))
    url.searchParams.set(
      'PriceCentsTo',
      String(Math.max(0, Math.round(Number(input.maximumPrice) * 100))),
    );
  if (input.postcode?.trim())
    url.searchParams.set('postcode', input.postcode.trim().slice(0, 12));
  if (Number.isFinite(input.distanceKm))
    url.searchParams.set(
      'distanceMeters',
      String(Math.round(clamp(Number(input.distanceKm), 1, 250) * 1000)),
    );
  return url;
}

export function isAllowedMarktplaatsListingUrl(value: string) {
  try {
    const url = new URL(value, 'https://www.marktplaats.nl');
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'www.marktplaats.nl' ||
        url.hostname === 'marktplaats.nl') &&
      /^\/v\/[^?#]+\/m\d{8,}(?:-|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function extractMarktplaatsListingId(value: string) {
  return (
    value
      .match(/(?:^|\/)m(\d{8,})(?:-|\/|$)/i)?.[0]
      ?.replace(/^\//, '')
      .split('-')[0] ??
    value.match(/\bm\d{8,}\b/i)?.[0]?.toLowerCase() ??
    null
  );
}

function decodeHtml(value: string) {
  return value
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#xA0;', ' ')
    .replaceAll('&#160;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&euro;', '€')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function capture(segment: string, pattern: RegExp) {
  const value = segment.match(pattern)?.[1];
  return value ? decodeHtml(value) : null;
}

function captureAttribute(segment: string, pattern: RegExp) {
  return segment.match(pattern)?.[1]?.replaceAll('&amp;', '&') ?? null;
}

export function detectMarktplaatsBlock(
  status: number,
  html: string,
  finalUrl = 'https://www.marktplaats.nl/',
): MarktplaatsAccessError | null {
  if (status === 403)
    return new MarktplaatsAccessError(
      'http_403',
      'Automated access was refused with HTTP 403.',
      status,
    );
  if (status === 429)
    return new MarktplaatsAccessError(
      'http_429',
      'Marktplaats rate-limited the public monitor.',
      status,
    );
  if (/\/login(?:[/?#]|$)|\/account(?:[/?#]|$)/i.test(finalUrl))
    return new MarktplaatsAccessError(
      'login_redirect',
      'The public search unexpectedly redirected to login.',
      status,
    );
  const sample = html.slice(0, 250_000).toLowerCase();
  if (/captcha|g-recaptcha|hcaptcha/.test(sample))
    return new MarktplaatsAccessError(
      'captcha',
      'A CAPTCHA was detected. Automated scanning has been paused.',
      status,
    );
  if (
    /challenge-platform|checking your browser|cf-chl-|access denied|bot detection/.test(
      sample,
    )
  )
    return new MarktplaatsAccessError(
      'challenge',
      'An anti-bot challenge was detected. Automated scanning has been paused.',
      status,
    );
  return null;
}

export function parseMarktplaatsPrice(value: string | null) {
  if (!value || /bieden|gratis|zie omschrijving/i.test(value)) return null;
  const normalised = value
    .replaceAll(/[^0-9,.-]/g, '')
    .replaceAll('.', '')
    .replace(',', '.');
  const price = Number(normalised);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function parseMarktplaatsSearchHtml(
  html: string,
  query: string,
  limit = MARKTPLAATS_MAX_RESULTS_PER_QUERY,
) {
  const blocked = detectMarktplaatsBlock(200, html);
  if (blocked) throw blocked;
  const listings: MarktplaatsParsedListing[] = [];
  const seen = new Set<string>();
  const segments = html.match(
    /<li\b[^>]*class="[^"]*\bhz-Listing\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi,
  );
  for (const segment of segments ?? []) {
    const relativeUrl = captureAttribute(
      segment,
      /href="([^"?#]*\/m\d{8,}(?:-[^"]*)?)"/i,
    );
    if (!relativeUrl) continue;
    const sourceListingId = extractMarktplaatsListingId(relativeUrl);
    const sourceListingUrl = new URL(relativeUrl, 'https://www.marktplaats.nl')
      .href;
    if (
      !sourceListingId ||
      seen.has(sourceListingId) ||
      !isAllowedMarktplaatsListingUrl(sourceListingUrl)
    )
      continue;
    const title = capture(
      segment,
      /<[^>]*class="[^"]*ListingTitle_[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    if (!title) continue;
    const priceText = capture(
      segment,
      /<[^>]*class="[^"]*ListingPrice_[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    const thumbnailUrl = captureAttribute(
      segment,
      /<img\b[^>]*(?:data-src|src)="(https:\/\/images\.marktplaats\.com\/[^" ]+)"/i,
    );
    seen.add(sourceListingId);
    listings.push({
      sourceListingId,
      sourceListingUrl,
      title,
      price: parseMarktplaatsPrice(priceText),
      location: capture(
        segment,
        /<[^>]*data-testid="location-label"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      ),
      seller: capture(
        segment,
        /<[^>]*class="[^"]*hz-Listing-seller-name-new[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      ),
      snippet: capture(
        segment,
        /<[^>]*class="[^"]*ListingDescription_[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      ),
      thumbnailUrl,
      listingTimestampText: capture(
        segment,
        /<[^>]*class="[^"]*ListingDate_[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      ),
      delivery:
        capture(
          segment,
          /<[^>]*class="[^"]*ListingAttribute_[^"]*"[^>]*>[\s\S]*?(Ophalen(?: of Verzenden)?|Verzenden)[\s\S]*?<\/[^>]+>/i,
        ) ?? null,
      sponsored: /Topadvertentie|Dagtopper|Opvallend|Sponsored/i.test(segment),
      foundByQueries: [query],
    });
    if (listings.length >= Math.min(limit, MARKTPLAATS_MAX_RESULTS_PER_QUERY))
      break;
  }
  return listings;
}

const dangerousPatterns: [RegExp, string][] = [
  [
    /\b(?:leeg|empty|box only|alleen doos|zonder kaarten)\b/i,
    'empty_packaging',
  ],
  [/\b(?:proxy|replica|fake|custom)\b/i, 'authenticity_risk'],
  [/\b(?:digitaal|code card)\b/i, 'digital_or_code'],
  [/\b(?:gezocht|wanted|ruilen|trade)\b/i, 'not_a_sale'],
  [/\b(?:open geweest|resealed|beschadigd)\b/i, 'condition_risk'],
];

export function assessMarktplaatsTitle(
  title: string,
  snippet = '',
): MarktplaatsTitleAssessment {
  const text = `${title} ${snippet}`.normalize('NFKD').toLowerCase();
  const game = /riftbound/.test(text)
    ? 'Riftbound'
    : /pokemon|pokémon/.test(text)
      ? 'Pokémon'
      : 'Unknown';
  const typePatterns: [RegExp, string][] = [
    [/\b(?:elite trainer box|etb)\b/i, 'Elite Trainer Box'],
    [/\b(?:booster box|boosterdoos|display)\b/i, 'Booster Box / Display'],
    [/\b(?:booster bundle|bundel)\b/i, 'Booster Bundle'],
    [/\b(?:binder|map)\b/i, 'Binder'],
    [/\b(?:collectie|verzameling|partij|lot)\b/i, 'Collection / Lot'],
    [/\b(?:case|doos)\b/i, 'Box / Case'],
    [/\b(?:kaart|kaarten|cards?)\b/i, 'Cards'],
  ];
  const productType =
    typePatterns.find(([pattern]) => pattern.test(text))?.[1] ?? 'Unknown';
  const riskFlags = dangerousPatterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, flag]) => flag);
  const sealedPositive = /\b(?:sealed|ongeopend|factory sealed)\b/i.test(text);
  const sealedNegative = /\b(?:open geweest|resealed|geopend)\b/i.test(text);
  const quantityMatch = title.match(/\b(\d{1,3})\s*[x×]\b/i);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
  let matchConfidence = game === 'Unknown' ? 25 : 62;
  if (productType !== 'Unknown') matchConfidence += 15;
  if (
    /\b(?:151|prismatic evolutions|destined rivals|origins|spiritforged)\b/i.test(
      text,
    )
  )
    matchConfidence += 15;
  if (sealedPositive) matchConfidence += 5;
  matchConfidence -= riskFlags.length * 18;
  matchConfidence = clamp(Math.round(matchConfidence), 0, 100);
  return {
    game,
    productType,
    sealedStatus: sealedNegative
      ? 'open'
      : sealedPositive
        ? 'sealed'
        : 'unknown',
    quantity,
    riskFlags,
    reviewRequired:
      riskFlags.length > 0 || game === 'Unknown' || matchConfidence < 90,
    matchConfidence,
  };
}

export function calculatePickupCost(input: PickupCostInput): PickupCost {
  const oneWayDistanceKm = Math.max(0, input.oneWayDistanceKm);
  const roundTripDistanceKm = oneWayDistanceKm * 2;
  const averageSpeedKmH = Math.max(10, input.averageSpeedKmH ?? 65);
  const travelTimeHours = roundTripDistanceKm / averageSpeedKmH;
  const fuelCost = roundTripDistanceKm * (input.fuelCostPerKm ?? 0.23);
  const parking = Math.max(0, input.parking ?? 0);
  const tolls = Math.max(0, input.tolls ?? 0);
  const travelTimeCost = travelTimeHours * (input.timeValuePerHour ?? 18);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    oneWayDistanceKm: round(oneWayDistanceKm),
    roundTripDistanceKm: round(roundTripDistanceKm),
    travelTimeHours: round(travelTimeHours),
    fuelCost: round(fuelCost),
    parking: round(parking),
    tolls: round(tolls),
    travelTimeCost: round(travelTimeCost),
    total: round(fuelCost + parking + tolls + travelTimeCost),
  };
}

export function conservativeMarktplaatsEconomics(
  itemPrice: number | null,
  pickupCost: PickupCost | null,
) {
  if (itemPrice === null) return null;
  return calculateEconomics({
    itemPrice,
    inboundShipping: 0,
    buyerFees: 0,
    paymentFees: 0,
    importCosts: 0,
    travelCost: pickupCost?.total ?? 0,
    acquisitionLabor: 0,
    expectedSalePrice: 0,
    sellerFees: 0,
    exitPaymentFees: 0,
    outboundShipping: 0,
    packaging: 0,
    expectedReturnLoss: 0,
    sellingLabor: 0,
    liquidityHaircut: 0,
    estimatedHours: Math.max(1, pickupCost?.travelTimeHours ?? 1),
    expectedHoldingDays: 90,
    requiredProfit: 25,
  });
}

export function deduplicateMarktplaatsListings(
  listings: MarktplaatsParsedListing[],
) {
  const deduped = new Map<string, MarktplaatsParsedListing>();
  for (const listing of listings) {
    const current = deduped.get(listing.sourceListingId);
    if (!current) {
      deduped.set(listing.sourceListingId, { ...listing });
      continue;
    }
    current.foundByQueries = [
      ...new Set([...current.foundByQueries, ...listing.foundByQueries]),
    ];
    if (!current.snippet && listing.snippet) current.snippet = listing.snippet;
  }
  return [...deduped.values()];
}

export function listingAvailabilityAfterMisses(missingScans: number) {
  if (missingScans >= 3) return 'unavailable' as const;
  if (missingScans >= 1) return 'possibly_unavailable' as const;
  return 'active' as const;
}

export function priceChange(previous: number | null, current: number | null) {
  if (previous === null || current === null || previous === current)
    return null;
  return {
    kind:
      current < previous
        ? ('price_decrease' as const)
        : ('price_increase' as const),
    from: previous,
    to: current,
    percentage: previous === 0 ? 0 : (current - previous) / previous,
  };
}
