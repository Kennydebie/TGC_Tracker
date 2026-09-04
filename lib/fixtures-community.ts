import {
  hypeRiskLabel,
  type CommunityDashboard,
  type CommunityProductRadar,
  type CommunitySourceStatus,
  type NormalisedCommunitySignal,
} from './community.ts';

function ago(now: number, minutes: number) {
  return new Date(now - minutes * 60_000).toISOString();
}

function fixtureSignal(
  now: number,
  input: Partial<NormalisedCommunitySignal> &
    Pick<
      NormalisedCommunitySignal,
      | 'id'
      | 'platform'
      | 'community'
      | 'externalId'
      | 'occurredAt'
      | 'signalType'
      | 'rawExcerpt'
    >,
): NormalisedCommunitySignal {
  return {
    channel: null,
    canonicalProductId: null,
    game: null,
    set: null,
    product: null,
    productType: null,
    price: null,
    currency: null,
    retailer: null,
    marketplace: null,
    country: null,
    region: null,
    language: null,
    quantity: null,
    urls: [],
    sentiment: 'NEUTRAL',
    intent: 'SPECULATING',
    confidence: 70,
    authorReliabilityId: 'author:fictional-pseudonym',
    verificationStatus: 'unverified',
    officialReference: false,
    unresolved: false,
    textHash: `fictional-hash-${input.id}`,
    rawExpiresAt: new Date(now + 24 * 3_600_000).toISOString(),
    score: null,
    commentCount: null,
    ...input,
  };
}

export function communityFixtureSignals(
  now = Date.now(),
): NormalisedCommunitySignal[] {
  return [
    fixtureSignal(now, {
      id: 'fixture-discord-spiritforged-1',
      platform: 'discord',
      community: 'Fictional EU Restock Guild',
      channel: 'eu-restocks',
      externalId: 'fixture-d-001',
      occurredAt: ago(now, 67),
      canonicalProductId: 'riftbound-spiritforged-display',
      game: 'Riftbound',
      set: 'Spiritforged',
      product: 'Riftbound Spiritforged Booster Display',
      productType: 'Booster display',
      signalType: 'RESTOCK_REPORT',
      price: 109,
      currency: 'EUR',
      marketplace: 'Amazon DE',
      country: 'DE',
      quantity: 12,
      sentiment: 'POSITIVE',
      intent: 'BUYING',
      confidence: 96,
      verificationStatus: 'confirmed',
      rawExcerpt:
        'FICTIONAL FIXTURE · Amazon DE Spiritforged display €109 live, 12 left.',
      urls: [
        {
          url: 'https://www.amazon.de/dp/B0RFTSPRT1',
          hostname: 'www.amazon.de',
          fetchAllowed: true,
          evidenceRole: 'marketplace',
        },
      ],
    }),
    fixtureSignal(now, {
      id: 'fixture-discord-spiritforged-2',
      platform: 'discord',
      community: 'Fictional Continental Stock Guild',
      channel: 'sealed-alerts',
      externalId: 'fixture-d-002',
      occurredAt: ago(now, 66),
      canonicalProductId: 'riftbound-spiritforged-display',
      game: 'Riftbound',
      set: 'Spiritforged',
      product: 'Riftbound Spiritforged Booster Display',
      productType: 'Booster display',
      signalType: 'DEAL_REPORT',
      price: 109,
      currency: 'EUR',
      marketplace: 'Amazon DE',
      country: 'DE',
      confidence: 93,
      verificationStatus: 'confirmed',
      rawExcerpt:
        'FICTIONAL FIXTURE · Independent confirmation: Spiritforged €109 on Amazon Germany.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-spiritforged-1',
      platform: 'reddit',
      community: 'Fictional Riftbound Deals Community',
      externalId: 'fixture-r-001',
      occurredAt: ago(now, 64),
      canonicalProductId: 'riftbound-spiritforged-display',
      game: 'Riftbound',
      set: 'Spiritforged',
      product: 'Riftbound Spiritforged Booster Display',
      productType: 'Booster display',
      signalType: 'DEAL_REPORT',
      price: 109,
      currency: 'EUR',
      marketplace: 'Amazon DE',
      confidence: 91,
      verificationStatus: 'confirmed',
      score: 23,
      commentCount: 8,
      rawExcerpt:
        'FICTIONAL FIXTURE · Spiritforged booster displays are back at €109; same listing confirmed by two readers.',
    }),
    fixtureSignal(now, {
      id: 'fixture-discord-local-151',
      platform: 'discord',
      community: 'Fictional Benelux Store Sightings',
      channel: 'local-stock',
      externalId: 'fixture-d-003',
      occurredAt: ago(now, 42),
      canonicalProductId: 'pokemon-151-bundle',
      game: 'Pokémon',
      set: '151',
      product: 'Pokémon 151 Booster Bundle',
      productType: 'Booster bundle',
      signalType: 'LOCAL_STOCK_REPORT',
      price: 34.99,
      currency: 'EUR',
      country: 'NL',
      region: 'utrecht',
      retailer: 'Fictional Game Shop',
      quantity: 6,
      confidence: 88,
      rawExcerpt:
        'FICTIONAL FIXTURE · Local Utrecht shop has six Pokémon 151 bundles at €34,99.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-prismatic-hype-1',
      platform: 'reddit',
      community: 'Fictional Pokémon Investing Community',
      externalId: 'fixture-r-002',
      occurredAt: ago(now, 31),
      canonicalProductId: 'pokemon-prismatic-etb',
      game: 'Pokémon',
      set: 'Prismatic Evolutions',
      product: 'Prismatic Evolutions Elite Trainer Box',
      productType: 'Elite trainer box',
      signalType: 'PRICE_HYPE',
      sentiment: 'VERY_POSITIVE',
      intent: 'INVESTING',
      confidence: 84,
      score: 91,
      commentCount: 63,
      rawExcerpt:
        'FICTIONAL FIXTURE · Copy-pasted hype claim says Prismatic will moon; no completed-sale evidence supplied.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-prismatic-hype-2',
      platform: 'reddit',
      community: 'Fictional Pokémon Investing Community',
      externalId: 'fixture-r-003',
      occurredAt: ago(now, 29),
      canonicalProductId: 'pokemon-prismatic-etb',
      game: 'Pokémon',
      set: 'Prismatic Evolutions',
      product: 'Prismatic Evolutions Elite Trainer Box',
      productType: 'Elite trainer box',
      signalType: 'INVESTMENT_HYPE',
      sentiment: 'VERY_POSITIVE',
      intent: 'INVESTING',
      confidence: 78,
      rawExcerpt:
        'FICTIONAL FIXTURE · Repeated wording and the same promotional link appear again.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-reprint-rumor',
      platform: 'reddit',
      community: 'Fictional Collector Discussion',
      externalId: 'fixture-r-004',
      occurredAt: ago(now, 21),
      canonicalProductId: 'pokemon-prismatic-etb',
      game: 'Pokémon',
      set: 'Prismatic Evolutions',
      product: 'Prismatic Evolutions Elite Trainer Box',
      productType: 'Elite trainer box',
      signalType: 'REPRINT_RUMOR',
      sentiment: 'MIXED',
      intent: 'SPECULATING',
      confidence: 73,
      rawExcerpt:
        'FICTIONAL FIXTURE · Unconfirmed Prismatic reprint rumor; no official source found.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-official-reference',
      platform: 'reddit',
      community: 'Fictional Release Watch',
      externalId: 'fixture-r-005',
      occurredAt: ago(now, 18),
      canonicalProductId: 'pokemon-destined-rivals-bb',
      game: 'Pokémon',
      set: 'Destined Rivals',
      product: 'Destined Rivals Booster Box',
      productType: 'Booster box',
      signalType: 'REPRINT_CONFIRMED_REFERENCE',
      officialReference: true,
      confidence: 90,
      rawExcerpt:
        'FICTIONAL FIXTURE · Community member linked an allowlisted official-domain announcement reference.',
      urls: [
        {
          url: 'https://www.pokemon.com/us/pokemon-news/?tcg-scout-fixture=1',
          hostname: 'www.pokemon.com',
          fetchAllowed: true,
          evidenceRole: 'official',
        },
      ],
    }),
    fixtureSignal(now, {
      id: 'fixture-discord-false-price',
      platform: 'discord',
      community: 'Fictional EU Restock Guild',
      channel: 'price-claims',
      externalId: 'fixture-d-004',
      occurredAt: ago(now, 12),
      canonicalProductId: 'pokemon-destined-rivals-bb',
      game: 'Pokémon',
      set: 'Destined Rivals',
      product: 'Destined Rivals Booster Box',
      productType: 'Booster box',
      signalType: 'DEAL_REPORT',
      price: 49,
      currency: 'EUR',
      confidence: 82,
      verificationStatus: 'not_confirmed',
      rawExcerpt:
        'FICTIONAL FIXTURE · Claimed €49 price was not found during marketplace verification.',
    }),
    fixtureSignal(now, {
      id: 'fixture-discord-ambiguous',
      platform: 'discord',
      community: 'Fictional General TCG Chat',
      channel: 'general',
      externalId: 'fixture-d-005',
      occurredAt: ago(now, 7),
      signalType: 'RESTOCK_REPORT',
      confidence: 31,
      unresolved: true,
      rawExcerpt:
        'FICTIONAL FIXTURE · “The new box is back” cannot be matched safely and belongs in Review Queue.',
    }),
    fixtureSignal(now, {
      id: 'fixture-reddit-scam-warning',
      platform: 'reddit',
      community: 'Fictional Buyer Safety Community',
      externalId: 'fixture-r-006',
      occurredAt: ago(now, 4),
      signalType: 'SCAM_WARNING',
      sentiment: 'NEGATIVE',
      intent: 'COMPLAINING',
      confidence: 68,
      unresolved: true,
      rawExcerpt:
        'FICTIONAL FIXTURE · Suspected retailer problem; no person is accused and details require review.',
    }),
  ];
}

function fixtureProducts(now: number): CommunityProductRadar[] {
  const products: CommunityProductRadar[] = [
    {
      id: 'fixture-event-spiritforged-109',
      canonicalProductId: 'riftbound-spiritforged-display',
      game: 'Riftbound',
      product: 'Riftbound Spiritforged Booster Display',
      momentumScore: 92,
      momentumChange: 205,
      redditChange: 241,
      discordChange: 384,
      uniqueAuthors: 83,
      uniqueCommunities: 5,
      priceMomentum: 4,
      sellerCountMomentum: -21,
      stockBreadthMomentum: -18,
      divergenceScore: 88,
      hypeRisk: 24,
      hypeRiskLabel: 'LOW',
      classification: 'EARLY_SIGNAL',
      sourceReliability: 91,
      mentionCounts: { m15: 7, h1: 43, h6: 121, h24: 186, d7: 552 },
      signalCounts: {
        RESTOCK_REPORT: 22,
        DEAL_REPORT: 14,
        SUPPLY_SHORTAGE_REPORT: 7,
      },
      sourceDistribution: [
        {
          source: 'Fictional EU Restock Guild',
          platform: 'discord',
          mentions: 71,
        },
        {
          source: 'Fictional Continental Stock Guild',
          platform: 'discord',
          mentions: 52,
        },
        {
          source: 'Fictional Riftbound Deals Community',
          platform: 'reddit',
          mentions: 31,
        },
      ],
      timeline: [
        {
          id: 'sf-1',
          at: ago(now, 67),
          source: 'Discord source A',
          label: 'First €109 restock report',
          status: 'signal',
        },
        {
          id: 'sf-2',
          at: ago(now, 66),
          source: 'Discord source B',
          label: 'Independent confirmation',
          status: 'signal',
        },
        {
          id: 'sf-3',
          at: ago(now, 64),
          source: 'Reddit source A',
          label: 'Cross-platform report',
          status: 'signal',
        },
        {
          id: 'sf-4',
          at: ago(now, 62),
          source: 'Amazon Scout fixture',
          label: 'Marketplace price verified',
          status: 'verification',
        },
        {
          id: 'sf-5',
          at: ago(now, 60),
          source: 'TCG Scout economics',
          label: 'Normal deal gate passed',
          status: 'market',
        },
        {
          id: 'sf-6',
          at: ago(now, 59),
          source: 'Community Radar',
          label: 'Confirmed deal alert created',
          status: 'alert',
        },
      ],
      conclusion:
        'Community attention accelerated faster than the observed fixture price while seller and stock breadth declined.',
      verificationStatus: 'confirmed',
      marketEvidence: {
        itemPrice: 109,
        deliveredPrice: 115,
        conservativeExit: 151,
        estimatedNetProfit: 28,
        roi: 0.24,
        confidenceGrade: 'A',
        sourceUrl: 'https://www.amazon.de/dp/B0RFTSPRT1',
        source: 'Amazon DE fixture verification',
      },
      firstDetectedAt: ago(now, 67),
      marketDetectedAt: ago(now, 59),
      leadTimeMinutes: 8,
      dataMode: 'fixture',
    },
    {
      id: 'fixture-event-prismatic-hype',
      canonicalProductId: 'pokemon-prismatic-etb',
      game: 'Pokémon',
      product: 'Prismatic Evolutions Elite Trainer Box',
      momentumScore: 89,
      momentumChange: 670,
      redditChange: 670,
      discordChange: 45,
      uniqueAuthors: 23,
      uniqueCommunities: 2,
      priceMomentum: 2,
      sellerCountMomentum: 1,
      stockBreadthMomentum: 0,
      divergenceScore: 51,
      hypeRisk: 82,
      hypeRiskLabel: hypeRiskLabel(82),
      classification: 'HYPE_WITHOUT_MARKET_SUPPORT',
      sourceReliability: 54,
      mentionCounts: { m15: 19, h1: 61, h6: 112, h24: 143, d7: 231 },
      signalCounts: { INVESTMENT_HYPE: 49, PRICE_HYPE: 33, REPRINT_RUMOR: 31 },
      sourceDistribution: [
        {
          source: 'Fictional Pokémon Investing Community',
          platform: 'reddit',
          mentions: 119,
        },
        {
          source: 'Fictional Collector Discussion',
          platform: 'reddit',
          mentions: 24,
        },
      ],
      timeline: [
        {
          id: 'pe-1',
          at: ago(now, 31),
          source: 'Reddit source B',
          label: 'Mention spike begins',
          status: 'signal',
        },
        {
          id: 'pe-2',
          at: ago(now, 29),
          source: 'Community Radar',
          label: 'Repeated wording cluster detected',
          status: 'verification',
        },
        {
          id: 'pe-3',
          at: ago(now, 21),
          source: 'Reddit source C',
          label: 'Unconfirmed reprint rumor',
          status: 'signal',
        },
        {
          id: 'pe-4',
          at: ago(now, 18),
          source: 'Market verification',
          label: 'Sales and seller count remain flat',
          status: 'market',
        },
      ],
      conclusion:
        'Possible coordinated or low-diversity promotion. Marketplace sales and seller count remain flat.',
      verificationStatus: 'not_confirmed',
      marketEvidence: {
        itemPrice: 74.95,
        deliveredPrice: 79.95,
        conservativeExit: null,
        estimatedNetProfit: null,
        roi: null,
        confidenceGrade: null,
        sourceUrl: null,
        source: 'Fixture market check',
      },
      firstDetectedAt: ago(now, 31),
      marketDetectedAt: ago(now, 18),
      leadTimeMinutes: null,
      dataMode: 'fixture',
    },
    {
      id: 'fixture-event-destined-reprint',
      canonicalProductId: 'pokemon-destined-rivals-bb',
      game: 'Pokémon',
      product: 'Destined Rivals Booster Box',
      momentumScore: 67,
      momentumChange: 84,
      redditChange: 102,
      discordChange: 31,
      uniqueAuthors: 38,
      uniqueCommunities: 4,
      priceMomentum: -3,
      sellerCountMomentum: 19,
      stockBreadthMomentum: 24,
      divergenceScore: 35,
      hypeRisk: 19,
      hypeRiskLabel: 'LOW',
      classification: 'SUPPLY_EXPANSION',
      sourceReliability: 83,
      mentionCounts: { m15: 3, h1: 14, h6: 39, h24: 72, d7: 305 },
      signalCounts: {
        REPRINT_CONFIRMED_REFERENCE: 9,
        SUPPLY_EXPANSION_REPORT: 18,
      },
      sourceDistribution: [
        { source: 'Fictional Release Watch', platform: 'reddit', mentions: 29 },
        {
          source: 'Fictional EU Restock Guild',
          platform: 'discord',
          mentions: 18,
        },
      ],
      timeline: [
        {
          id: 'dr-1',
          at: ago(now, 18),
          source: 'Reddit source D',
          label: 'Official-domain reference shared',
          status: 'signal',
        },
        {
          id: 'dr-2',
          at: ago(now, 16),
          source: 'Community Radar',
          label: 'Authoritative host allowlist passed',
          status: 'verification',
        },
        {
          id: 'dr-3',
          at: ago(now, 12),
          source: 'Market breadth',
          label: 'Seller count and stock breadth expand',
          status: 'market',
        },
      ],
      conclusion:
        'The official-domain reference and broader supply point to expansion, not scarcity.',
      verificationStatus: 'confirmed',
      marketEvidence: {
        itemPrice: 119.99,
        deliveredPrice: 129.94,
        conservativeExit: 149,
        estimatedNetProfit: 8,
        roi: 0.06,
        confidenceGrade: 'B',
        sourceUrl: null,
        source: 'Fixture supply verification',
      },
      firstDetectedAt: ago(now, 18),
      marketDetectedAt: ago(now, 12),
      leadTimeMinutes: 6,
      dataMode: 'fixture',
    },
  ];
  return products;
}

function fixtureSources(now: number): CommunitySourceStatus[] {
  return [
    {
      id: 'fixture-discord-eu-restocks',
      platform: 'discord',
      name: 'Fictional EU Restock Guild · #eu-restocks',
      enabled: true,
      games: ['Pokémon', 'Riftbound'],
      categories: ['Restocks', 'Deals', 'Prices'],
      reliability: 91,
      status: 'credentials_required',
      lastSignalAt: ago(now, 12),
      lastError: null,
      guildId: 'fixture-guild-a',
      channelId: 'fixture-channel-a',
      messageContentAvailable: null,
      scanIntervalMinutes: null,
      processedToday: 323,
      signalsToday: 47,
      medianLeadMinutes: 7,
      dataMode: 'fixture',
    },
    {
      id: 'fixture-discord-local',
      platform: 'discord',
      name: 'Fictional Benelux Store Sightings · #local-stock',
      enabled: true,
      games: ['Pokémon'],
      categories: ['Restocks', 'General'],
      reliability: 78,
      status: 'credentials_required',
      lastSignalAt: ago(now, 42),
      lastError: null,
      guildId: 'fixture-guild-b',
      channelId: 'fixture-channel-b',
      messageContentAvailable: null,
      scanIntervalMinutes: null,
      processedToday: 84,
      signalsToday: 9,
      medianLeadMinutes: 12,
      dataMode: 'fixture',
    },
    {
      id: 'fixture-reddit-riftbound-deals',
      platform: 'reddit',
      name: 'Fictional Riftbound Deals Community',
      enabled: true,
      games: ['Riftbound'],
      categories: ['Deals', 'Restocks', 'Releases'],
      reliability: 86,
      status: 'credentials_required',
      lastSignalAt: ago(now, 64),
      lastError: null,
      scanIntervalMinutes: 15,
      processedToday: 41,
      signalsToday: 11,
      rateLimitRemaining: null,
      medianLeadMinutes: 42,
      dataMode: 'fixture',
    },
    {
      id: 'fixture-reddit-pokemon-watch',
      platform: 'reddit',
      name: 'Fictional Pokémon Community Watch',
      enabled: true,
      games: ['Pokémon'],
      categories: ['Reprints', 'Prices', 'Scams'],
      reliability: 63,
      status: 'credentials_required',
      lastSignalAt: ago(now, 4),
      lastError: null,
      scanIntervalMinutes: 15,
      processedToday: 118,
      signalsToday: 27,
      rateLimitRemaining: null,
      medianLeadMinutes: null,
      dataMode: 'fixture',
    },
  ];
}

export function communityFixtureDashboard(
  options: {
    redditConnected?: boolean;
    discordConnected?: boolean;
    now?: number;
  } = {},
): CommunityDashboard {
  const now = options.now ?? Date.now();
  const products = fixtureProducts(now);
  const recentSignals = communityFixtureSignals(now);
  const sources = fixtureSources(now);
  const verified = recentSignals.filter(
    (signal) => signal.verificationStatus === 'confirmed',
  ).length;
  const rejected = recentSignals.filter(
    (signal) => signal.verificationStatus === 'not_confirmed',
  ).length;
  const verifiable = verified + rejected;
  const leadTimes = products
    .flatMap((product) =>
      product.leadTimeMinutes === null ? [] : [product.leadTimeMinutes],
    )
    .sort((a, b) => a - b);
  const medianLead = leadTimes.length
    ? leadTimes[Math.floor(leadTimes.length / 2)]
    : null;
  const bestSource = [...sources]
    .filter((source) => source.medianLeadMinutes !== null)
    .sort(
      (a, b) =>
        (b.medianLeadMinutes ?? -Infinity) - (a.medianLeadMinutes ?? -Infinity),
    )[0];
  return {
    generatedAt: new Date(now).toISOString(),
    dataMode: 'fixture',
    reddit: {
      connected: Boolean(options.redditConnected),
      status: options.redditConnected ? 'connected' : 'credentials_required',
      detail: options.redditConnected
        ? 'Authenticated API available; displayed records remain isolated fixtures.'
        : 'Reddit API credentials required. No HTML scraping fallback.',
    },
    discord: {
      connected: Boolean(options.discordConnected),
      status: options.discordConnected ? 'connected' : 'bot_required',
      detail: options.discordConnected
        ? 'Bot configuration detected; displayed records remain isolated fixtures.'
        : 'Discord bot token, explicit guild/channel allowlists and message-content permission are required.',
    },
    metrics: {
      signals24h: recentSignals.length,
      productsTrending: products.filter(
        (product) => product.momentumScore >= 65,
      ).length,
      earlySignals: products.filter(
        (product) => product.classification === 'EARLY_SIGNAL',
      ).length,
      confirmedDeals: products.filter(
        (product) =>
          product.verificationStatus === 'confirmed' &&
          (product.marketEvidence.estimatedNetProfit ?? 0) >= 25,
      ).length,
      highHypeRiskProducts: products.filter((product) => product.hypeRisk >= 75)
        .length,
      bestLeadTimeSource: bestSource
        ? `${bestSource.name} · +${bestSource.medianLeadMinutes}m`
        : null,
    },
    products,
    recentSignals,
    sources,
    performance: {
      signalsDetected: recentSignals.length,
      verifiedRate: verifiable ? verified / verifiable : null,
      falseSignalRate: verifiable ? rejected / verifiable : null,
      medianVerificationMinutes: 4,
      medianLeadMinutes: medianLead,
      profitableConfirmedRate:
        products.filter((product) => product.verificationStatus === 'confirmed')
          .length > 0
          ? products.filter(
              (product) =>
                product.verificationStatus === 'confirmed' &&
                (product.marketEvidence.estimatedNetProfit ?? 0) > 0,
            ).length /
            products.filter(
              (product) => product.verificationStatus === 'confirmed',
            ).length
          : null,
      averagePriceMove24h: 0.03,
    },
  };
}
