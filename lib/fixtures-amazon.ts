import {
  AMAZON_DISCOVERY_INTERVAL_MINUTES,
  AMAZON_WATCHED_INTERVAL_MINUTES,
  DEFAULT_AMAZON_MARKETS,
  KEEPA_ENABLED_EU_MARKETS,
  amazonOpportunityScore,
  amazonRiskScore,
  buildAmazonProductUrl,
  calculatePriceHistory,
  deliveredPrice,
  maximumAmazonPrices,
  msrpStatus,
  offerFreshness,
  parseAmazonQuantity,
  priceDrop,
  qualifiesAmazonQuickFlip,
  roundMoney,
  type AmazonDashboard,
  type AmazonMarketplaceCode,
  type AmazonOpportunity,
  type SellerType,
  type ShippingStatus,
} from './amazon.ts';

type FixtureInput = {
  id: string;
  canonicalProductId: string;
  product: string;
  game: string;
  asin: string;
  marketplace: AmazonMarketplaceCode;
  sellerType: SellerType;
  currentPrice: number;
  shipping: number | null;
  shippingStatus: ShippingStatus;
  previousPrice: number | null;
  median90: number;
  historyPrices: number[];
  exit: number | null;
  exitEvidence?: AmazonOpportunity['economics']['exitEvidence'];
  sellerCount: number | null;
  sellerCountChange?: number | null;
  matchConfidence: number;
  liquidity: AmazonOpportunity['liquidity'];
  title?: string;
  language?: string;
  msrp?: number | null;
  ageMinutes?: number;
  isRestock?: boolean;
  newlyDiscovered?: boolean;
  watched?: boolean;
  extraRiskFlags?: string[];
};

function fixtureOpportunity(
  input: FixtureInput,
  now: number,
): AmazonOpportunity {
  const title = input.title ?? input.product;
  const quantity = parseAmazonQuantity(title);
  const sourceUpdatedAt = new Date(
    now - (input.ageMinutes ?? 4) * 60_000,
  ).toISOString();
  const freshness = offerFreshness(sourceUpdatedAt, now);
  const delivered = deliveredPrice({
    itemPrice: input.currentPrice,
    shipping: input.shipping,
    shippingStatus: input.shippingStatus,
  });
  const historyPoints = input.historyPrices.map((price, index) => ({
    at: new Date(
      now - (input.historyPrices.length - index) * 7 * 86_400_000,
    ).toISOString(),
    price,
  }));
  const history = calculatePriceHistory(input.currentPrice, historyPoints, now);
  history.median90d = input.median90;
  const drop = priceDrop(input.previousPrice, input.currentPrice);
  const riskFlags = [...(input.extraRiskFlags ?? [])];
  if (quantity.ambiguous) riskFlags.push('quantity_ambiguous');
  if ((input.language ?? 'English') !== 'English')
    riskFlags.push('foreign_language');
  if (!input.exit) riskFlags.push('weak_exit_evidence');
  if (input.matchConfidence < 90) riskFlags.push('low_match_confidence');
  const profit =
    delivered !== null && input.exit !== null
      ? roundMoney(input.exit - delivered)
      : null;
  const roi =
    profit !== null && delivered && delivered > 0 ? profit / delivered : null;
  const maximum = input.exit
    ? maximumAmazonPrices({
        conservativeNetExit: input.exit,
        nonItemAcquisitionCosts: input.shipping ?? 0,
        requiredProfit: 25,
      })
    : { maximumAmazonItemPrice: null, maximumAmazonDeliveredPrice: null };
  const economics: AmazonOpportunity['economics'] = {
    conservativeExit: input.exit,
    exitEvidence:
      input.exitEvidence ?? (input.exit ? 'modelled_fixture' : 'none'),
    preferredExit: input.exit ? 'Cardmarket' : 'None',
    conservativeProfit: profit,
    roi,
    profitPerHour: profit,
    expectedHoldingDays: input.liquidity === 'High' ? 12 : 45,
    ...maximum,
  };
  const risk = amazonRiskScore({
    riskFlags,
    shippingStatus: input.shippingStatus,
    sellerType: input.sellerType,
    freshness: freshness.label,
    matchConfidence: input.matchConfidence,
  });
  const score = amazonOpportunityScore({
    discountToExit:
      delivered !== null && input.exit
        ? (input.exit - delivered) / input.exit
        : 0,
    historicalPercentile: history.historicalPercentile,
    profit: profit ?? 0,
    roi: roi ?? 0,
    sellerType: input.sellerType,
    liquidity: input.liquidity,
    priceDropMagnitude: drop?.percentage ?? 0,
    sellerCountTrend: input.sellerCountChange ?? null,
    dataConfidence: input.matchConfidence,
    riskFlags,
    shippingStatus: input.shippingStatus,
    freshness: freshness.label,
  });
  const base: AmazonOpportunity = {
    id: input.id,
    canonicalProductId: input.canonicalProductId,
    product: input.product,
    game: input.game,
    asin: input.asin,
    marketplace: input.marketplace,
    sourceListingUrl: buildAmazonProductUrl(input.asin, input.marketplace),
    sellerType: input.sellerType,
    sellerName:
      input.sellerType === 'AMAZON_DIRECT' ? 'Amazon' : 'Fixture seller',
    sellerRating: input.sellerType === 'FBM' ? 93.4 : null,
    currentPrice: input.currentPrice,
    buyBoxPrice: input.currentPrice,
    amazonPrice:
      input.sellerType === 'AMAZON_DIRECT' ? input.currentPrice : null,
    lowestNew: input.currentPrice,
    shipping: input.shipping,
    shippingStatus: input.shippingStatus,
    mandatoryFees: 0,
    deliveredPrice: delivered,
    currency: 'EUR',
    quantity,
    productLanguage: input.language ?? 'English',
    sellerCount: input.sellerCount,
    offerCount: input.sellerCount,
    sellerCountChange: input.sellerCountChange ?? null,
    availability: 'available',
    history,
    previousPrice: input.previousPrice,
    priceDropPercentage: drop?.percentage ?? null,
    msrp: input.msrp ?? null,
    msrpStatus: msrpStatus(input.msrp ?? null, input.currentPrice),
    liquidity: input.liquidity,
    score,
    risk,
    matchConfidence: input.matchConfidence,
    matchMethod: 'fixture ASIN mapping',
    riskFlags,
    freshness: freshness.label,
    sourceUpdatedAt,
    fetchedAt: new Date(now).toISOString(),
    ageMinutes: freshness.ageMinutes,
    economics,
    qualified: false,
    reviewRequired: riskFlags.length > 0 || input.matchConfidence < 90,
    isRestock: input.isRestock ?? false,
    newlyDiscovered: input.newlyDiscovered ?? false,
    watched: input.watched ?? true,
    dataMode: 'fixture',
  };
  return { ...base, qualified: qualifiesAmazonQuickFlip(base) };
}

export function amazonFixtureDashboard(now = Date.now()): AmazonDashboard {
  const opportunities = [
    fixtureOpportunity(
      {
        id: 'amazon-fixture-prismatic-de',
        canonicalProductId: 'pokemon-prismatic-etb',
        product: 'Pokémon Prismatic Evolutions Elite Trainer Box',
        game: 'Pokémon TCG',
        asin: 'B0DPKPRSM1',
        marketplace: 'DE',
        sellerType: 'AMAZON_DIRECT',
        currentPrice: 54.99,
        shipping: 5.99,
        shippingStatus: 'ESTIMATED',
        previousPrice: 74.95,
        median90: 78.9,
        historyPrices: [
          78.9, 79.5, 72.5, 84.9, 69.95, 74.95, 81.9, 76.5, 61.95,
        ],
        exit: 94,
        sellerCount: 8,
        sellerCountChange: -4,
        matchConfidence: 97,
        liquidity: 'High',
        msrp: 54.99,
      },
      now,
    ),
    fixtureOpportunity(
      {
        id: 'amazon-fixture-prismatic-fr',
        canonicalProductId: 'pokemon-prismatic-etb',
        product: 'Pokémon Prismatic Evolutions Elite Trainer Box',
        game: 'Pokémon TCG',
        asin: 'B0FRPRSME1',
        marketplace: 'FR',
        sellerType: 'FBA',
        currentPrice: 58.5,
        shipping: 8,
        shippingStatus: 'ESTIMATED',
        previousPrice: 69.9,
        median90: 75.5,
        historyPrices: [71, 74, 68, 80, 76, 69, 72, 65],
        exit: 94,
        sellerCount: 13,
        matchConfidence: 95,
        liquidity: 'High',
      },
      now,
    ),
    fixtureOpportunity(
      {
        id: 'amazon-fixture-destined-it',
        canonicalProductId: 'pokemon-destined-rivals-bb',
        product: 'Pokémon Destined Rivals Booster Box 36 Packs',
        game: 'Pokémon TCG',
        asin: 'B0DSTD36IT',
        marketplace: 'IT',
        sellerType: 'FBA',
        currentPrice: 119.99,
        shipping: 9.95,
        shippingStatus: 'ESTIMATED',
        previousPrice: 149.99,
        median90: 154.5,
        historyPrices: [155, 149, 162, 145, 159, 151, 140],
        exit: 174,
        sellerCount: 5,
        sellerCountChange: -3,
        matchConfidence: 96,
        liquidity: 'Medium',
        msrp: 143.64,
      },
      now,
    ),
    fixtureOpportunity(
      {
        id: 'amazon-fixture-151-es',
        canonicalProductId: 'pokemon-151-bundle',
        product: 'Pokémon 151 Booster Bundle 6 Booster Packs',
        game: 'Pokémon TCG',
        asin: 'B0P151B6ES',
        marketplace: 'ES',
        sellerType: 'AMAZON_DIRECT',
        currentPrice: 31.95,
        shipping: 7.5,
        shippingStatus: 'ESTIMATED',
        previousPrice: null,
        median90: 48.5,
        historyPrices: [44, 49, 52, 47, 46, 55, 45],
        exit: 66,
        sellerCount: 19,
        sellerCountChange: 13,
        matchConfidence: 98,
        liquidity: 'High',
        isRestock: true,
      },
      now,
    ),
    fixtureOpportunity(
      {
        id: 'amazon-fixture-riftbound-fr',
        canonicalProductId: 'riftbound-spiritforged-display',
        product: 'Riftbound Spiritforged Booster Display',
        game: 'Riftbound TCG',
        asin: 'B0RFTSPFR1',
        marketplace: 'FR',
        sellerType: 'FBM',
        currentPrice: 139.99,
        shipping: null,
        shippingStatus: 'UNKNOWN',
        previousPrice: 159.99,
        median90: 154,
        historyPrices: [155, 160, 149, 158, 152],
        exit: 171,
        sellerCount: 3,
        matchConfidence: 91,
        liquidity: 'Medium',
        newlyDiscovered: true,
        extraRiskFlags: ['new_release_hype'],
      },
      now,
    ),
    fixtureOpportunity(
      {
        id: 'amazon-fixture-review-de',
        canonicalProductId: 'pokemon-destined-rivals-bb',
        product: 'Pokémon Destined Rivals Display',
        title: 'Pokémon Destined Rivals Empty Display Box / Storage Accessory',
        game: 'Pokémon TCG',
        asin: 'B0EMPTYBX1',
        marketplace: 'DE',
        sellerType: 'UNKNOWN',
        currentPrice: 29.99,
        shipping: 4.99,
        shippingStatus: 'ESTIMATED',
        previousPrice: 39.99,
        median90: 37.5,
        historyPrices: [38, 40, 36, 39],
        exit: null,
        sellerCount: null,
        matchConfidence: 42,
        liquidity: 'Unknown',
        extraRiskFlags: ['empty_or_accessory'],
        newlyDiscovered: true,
        watched: false,
      },
      now,
    ),
  ];
  return {
    sourceState: 'key_required',
    apiConnected: false,
    dataMode: 'fixture',
    keyAvailable: false,
    reason:
      'Keepa API key required. The cards below are isolated recorded fixtures, not live Amazon offers.',
    markets: DEFAULT_AMAZON_MARKETS,
    keepaMarkets: KEEPA_ENABLED_EU_MARKETS,
    unsupportedKeepaMarkets: ['NL', 'BE'],
    watchedIntervalMinutes: AMAZON_WATCHED_INTERVAL_MINUTES,
    discoveryIntervalMinutes: AMAZON_DISCOVERY_INTERVAL_MINUTES,
    lastScanAt: null,
    nextWatchedScanAt: null,
    nextDiscoveryScanAt: null,
    tokens: {
      available: null,
      usedThisScan: 0,
      refillRatePerMinute: null,
      nextSafeScanAt: null,
      skipped: 0,
    },
    metrics: {
      productsMonitored: 0,
      productsChecked: 0,
      priceChanges: 0,
      priceDrops: 0,
      newProducts: 0,
      qualified: 0,
      errors: 0,
    },
    opportunities,
  };
}
