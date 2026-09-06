import type { ScoutGame } from './scout-games.ts';

export const COMMUNITY_SIGNAL_TYPES = [
  'RESTOCK_REPORT',
  'DEAL_REPORT',
  'PRICE_DROP_REPORT',
  'SOLD_OUT_REPORT',
  'LOCAL_STOCK_REPORT',
  'NEW_PRODUCT_REPORT',
  'PREORDER_REPORT',
  'REPRINT_RUMOR',
  'REPRINT_CONFIRMED_REFERENCE',
  'RELEASE_RUMOR',
  'OFFICIAL_NEWS_REFERENCE',
  'COMPETITIVE_CATALYST',
  'BAN_DISCUSSION',
  'DEMAND_SPIKE',
  'SUPPLY_SHORTAGE_REPORT',
  'SUPPLY_EXPANSION_REPORT',
  'SCAM_WARNING',
  'SELLER_WARNING',
  'RETAILER_WARNING',
  'GRADING_DISCUSSION',
  'INVESTMENT_HYPE',
  'PRICE_HYPE',
  'COLLECTION_FLIP',
  'GENERAL_SENTIMENT',
] as const;

export type CommunitySignalType = (typeof COMMUNITY_SIGNAL_TYPES)[number];
export type CommunityPlatform = 'reddit' | 'discord';
export type CommunityDataMode = 'production' | 'fixture';
export type CommunitySentiment =
  | 'VERY_POSITIVE'
  | 'POSITIVE'
  | 'NEUTRAL'
  | 'NEGATIVE'
  | 'VERY_NEGATIVE'
  | 'MIXED';
export type CommunityIntent =
  | 'BUYING'
  | 'SELLING'
  | 'LOOKING_FOR_STOCK'
  | 'INVESTING'
  | 'PLAYING'
  | 'COLLECTING'
  | 'COMPLAINING'
  | 'SPECULATING';
export type EarlySignalClassification =
  | 'EARLY_SIGNAL'
  | 'CONFIRMED_MOVE'
  | 'PRICED_IN'
  | 'HYPE_WITHOUT_MARKET_SUPPORT'
  | 'SUPPLY_EXPANSION'
  | 'SUPPLY_CONTRACTION'
  | 'CONFLICTING_SIGNALS'
  | 'INSUFFICIENT_DATA';
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'confirmed'
  | 'not_confirmed'
  | 'price_changed'
  | 'out_of_stock'
  | 'wrong_product';

export type CommunitySourceInput = {
  platform: CommunityPlatform;
  community: string;
  channel?: string | null;
  externalId: string;
  authorExternalId?: string | null;
  occurredAt: string;
  text: string;
  score?: number | null;
  commentCount?: number | null;
  permalink?: string | null;
};

export type ProductCandidate = {
  canonicalProductId: string;
  game: string;
  set: string;
  product: string;
  productType: string;
  confidence: number;
  matchedAlias: string;
};

export type ExtractedUrl = {
  url: string;
  hostname: string;
  fetchAllowed: boolean;
  evidenceRole: 'marketplace' | 'official' | 'retailer' | 'unknown';
};

export type NormalisedCommunitySignal = {
  id: string;
  platform: CommunityPlatform;
  community: string;
  channel: string | null;
  externalId: string;
  occurredAt: string;
  canonicalProductId: string | null;
  game: string | null;
  set: string | null;
  product: string | null;
  productType: string | null;
  signalType: CommunitySignalType;
  price: number | null;
  currency: 'EUR' | 'GBP' | 'USD' | null;
  retailer: string | null;
  marketplace: string | null;
  country: string | null;
  region: string | null;
  language: string | null;
  quantity: number | null;
  urls: ExtractedUrl[];
  sentiment: CommunitySentiment;
  intent: CommunityIntent;
  confidence: number;
  authorReliabilityId: string | null;
  verificationStatus: VerificationStatus;
  officialReference: boolean;
  unresolved: boolean;
  textHash: string;
  rawExcerpt: string;
  rawExpiresAt: string;
  score: number | null;
  commentCount: number | null;
};

export type CommunityTimelineItem = {
  id: string;
  at: string;
  source: string;
  label: string;
  status: 'signal' | 'verification' | 'market' | 'alert';
};

export type CommunityProductRadar = {
  id: string;
  canonicalProductId: string;
  game: string;
  product: string;
  momentumScore: number;
  momentumChange: number;
  redditChange: number;
  discordChange: number;
  uniqueAuthors: number;
  uniqueCommunities: number;
  priceMomentum: number | null;
  sellerCountMomentum: number | null;
  stockBreadthMomentum: number | null;
  divergenceScore: number;
  hypeRisk: number;
  hypeRiskLabel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  classification: EarlySignalClassification;
  sourceReliability: number;
  mentionCounts: {
    m15: number;
    h1: number;
    h6: number;
    h24: number;
    d7: number;
  };
  signalCounts: Partial<Record<CommunitySignalType, number>>;
  sourceDistribution: Array<{
    source: string;
    platform: CommunityPlatform;
    mentions: number;
  }>;
  timeline: CommunityTimelineItem[];
  conclusion: string;
  verificationStatus: VerificationStatus;
  marketEvidence: {
    itemPrice: number | null;
    deliveredPrice: number | null;
    conservativeExit: number | null;
    estimatedNetProfit: number | null;
    roi: number | null;
    confidenceGrade: string | null;
    sourceUrl: string | null;
    source: string | null;
  };
  firstDetectedAt: string;
  marketDetectedAt: string | null;
  leadTimeMinutes: number | null;
  dataMode: CommunityDataMode;
};

export type CommunitySourceStatus = {
  id: string;
  platform: CommunityPlatform;
  name: string;
  enabled: boolean;
  games: string[];
  categories: string[];
  reliability: number | null;
  status:
    | 'connected'
    | 'credentials_required'
    | 'permission_required'
    | 'disabled'
    | 'error';
  lastSignalAt: string | null;
  lastError: string | null;
  guildId?: string | null;
  channelId?: string | null;
  messageContentAvailable?: boolean | null;
  scanIntervalMinutes?: number | null;
  processedToday: number;
  signalsToday: number;
  rateLimitRemaining?: number | null;
  medianLeadMinutes: number | null;
  dataMode: CommunityDataMode;
};

export type ScoutResearchFinding = {
  id: string;
  sourceKind:
    | 'reddit_post'
    | 'reddit_comment'
    | 'retailer'
    | 'official'
    | 'public_web';
  sourceIdentifier: string;
  game: ScoutGame;
  headline: string | null;
  productName: string | null;
  productLanguage: string | null;
  updateType:
    | 'deal'
    | 'restock'
    | 'preorder'
    | 'price_change'
    | 'reprint'
    | 'release'
    | 'market_update';
  summary: string;
  sourceUrl: string | null;
  subreddit: string | null;
  sourceExternalId: string | null;
  retailerOrOfficialUrl: string | null;
  publishedAt: string | null;
  observedAt: string;
  materialChangedAt: string;
  eventAt: string | null;
  actionOpensAt: string | null;
  actionDeadlineAt: string | null;
  actionType:
    | 'register'
    | 'preorder'
    | 'buy'
    | 'attend'
    | 'verify'
    | 'watch'
    | 'none'
    | null;
  actionInstruction: string | null;
  actionUrl: string | null;
  lifecycleStatus:
    | 'announced'
    | 'registration_open'
    | 'preorder_open'
    | 'in_stock'
    | 'closed'
    | 'cancelled'
    | 'unknown';
  price: number | null;
  currency: 'EUR' | 'GBP' | 'USD' | null;
  region: string | null;
  shippingToNetherlands: 'confirmed' | 'unavailable' | 'unknown';
  availability: 'in_stock' | 'preorder' | 'sold_out' | 'unknown';
  verificationStatus:
    | 'community_report'
    | 'retailer_checked'
    | 'official_checked';
  verificationEvidenceUrl: string | null;
  verificationObservedAt: string | null;
  retailerName: string | null;
  collectionMethod: 'chatgpt_web_research';
};

export type ScoutResearchImportStatus = {
  lastSuccessfulImportAt: string | null;
  lastAttemptAt: string | null;
  lastRunStatus: 'completed' | 'partial' | 'failed' | null;
  actionableError: string | null;
  latestRun: {
    finishedAt: string;
    inserted: number;
    updated: number;
    unchanged: number;
    rejected: number;
    sourcesChecked: number;
    sourcesUnavailable: number;
  } | null;
};

export type CommunityDashboard = {
  generatedAt: string;
  dataMode: CommunityDataMode;
  admin: boolean;
  reddit: { connected: boolean; status: string; detail: string };
  discord: { connected: boolean; status: string; detail: string };
  metrics: {
    signals24h: number;
    productsTrending: number;
    earlySignals: number;
    confirmedDeals: number;
    highHypeRiskProducts: number;
    bestLeadTimeSource: string | null;
  };
  products: CommunityProductRadar[];
  recentSignals: NormalisedCommunitySignal[];
  researchFindings: ScoutResearchFinding[];
  researchImport: ScoutResearchImportStatus;
  sources: CommunitySourceStatus[];
  performance: {
    signalsDetected: number;
    verifiedRate: number | null;
    falseSignalRate: number | null;
    medianVerificationMinutes: number | null;
    medianLeadMinutes: number | null;
    profitableConfirmedRate: number | null;
    averagePriceMove24h: number | null;
  };
};

export function emptyCommunityDashboard(
  options: {
    generatedAt?: string;
    admin?: boolean;
    reddit?: CommunityDashboard['reddit'];
    discord?: CommunityDashboard['discord'];
    sources?: CommunitySourceStatus[];
  } = {},
): CommunityDashboard {
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    dataMode: 'production',
    admin: options.admin ?? false,
    reddit: options.reddit ?? {
      connected: false,
      status: 'credentials_required',
      detail: 'Reddit API credentials are required before signals can load.',
    },
    discord: options.discord ?? {
      connected: false,
      status: 'bot_required',
      detail:
        'A configured Discord listener is required before signals can load.',
    },
    metrics: {
      signals24h: 0,
      productsTrending: 0,
      earlySignals: 0,
      confirmedDeals: 0,
      highHypeRiskProducts: 0,
      bestLeadTimeSource: null,
    },
    products: [],
    recentSignals: [],
    researchFindings: [],
    researchImport: {
      lastSuccessfulImportAt: null,
      lastAttemptAt: null,
      lastRunStatus: null,
      actionableError: null,
      latestRun: null,
    },
    sources: options.sources ?? [],
    performance: {
      signalsDetected: 0,
      verifiedRate: null,
      falseSignalRate: null,
      medianVerificationMinutes: null,
      medianLeadMinutes: null,
      profitableConfirmedRate: null,
      averagePriceMove24h: null,
    },
  };
}

export type MomentumInput = {
  mentionVelocity: number;
  uniqueAuthors: number;
  uniqueCommunities: number;
  sourceReliability: number;
  actionableRatio: number;
  sentimentShift: number;
  linkDiversity: number;
  repeatedTextRatio?: number;
  singleSourceRatio?: number;
  lowHistoryAuthorRatio?: number;
};

export type HypeRiskInput = {
  mentionAcceleration: number;
  lowHistoryAuthorRatio: number;
  repeatedTextRatio: number;
  repeatedLinkRatio: number;
  dominantSourceRatio: number;
  crossPostRatio: number;
  marketplaceSalesMomentum: number | null;
  sellerCountMomentum: number | null;
  priceMomentum: number | null;
};

type ProductDictionaryEntry = Omit<
  ProductCandidate,
  'confidence' | 'matchedAlias'
> & {
  aliases: string[];
};

export const COMMUNITY_PRODUCT_DICTIONARY: ProductDictionaryEntry[] = [
  {
    canonicalProductId: 'pokemon-prismatic-etb',
    game: 'Pokémon',
    set: 'Prismatic Evolutions',
    product: 'Prismatic Evolutions Elite Trainer Box',
    productType: 'Elite trainer box',
    aliases: [
      'prismatic evolutions etb',
      'prismatic evolutions',
      'pe etb',
      'prismatic',
    ],
  },
  {
    canonicalProductId: 'pokemon-151-bundle',
    game: 'Pokémon',
    set: '151',
    product: 'Pokémon 151 Booster Bundle',
    productType: 'Booster bundle',
    aliases: [
      'pokemon 151 booster bundle',
      'pokémon 151 booster bundle',
      '151 booster bundle',
    ],
  },
  {
    canonicalProductId: 'pokemon-destined-rivals-bb',
    game: 'Pokémon',
    set: 'Destined Rivals',
    product: 'Destined Rivals Booster Box',
    productType: 'Booster box',
    aliases: [
      'destined rivals booster box',
      'destined rivals display',
      'dr booster',
      'destined rivals',
    ],
  },
  {
    canonicalProductId: 'riftbound-spiritforged-display',
    game: 'Riftbound',
    set: 'Spiritforged',
    product: 'Riftbound Spiritforged Booster Display',
    productType: 'Booster display',
    aliases: [
      'riftbound spiritforged booster display',
      'spiritforged booster display',
      'spiritforged display',
      'spiritforged',
    ],
  },
  {
    canonicalProductId: 'riftbound-origins-display',
    game: 'Riftbound',
    set: 'Origins',
    product: 'Riftbound Origins Booster Display',
    productType: 'Booster display',
    aliases: [
      'riftbound origins booster display',
      'origins booster display',
      'riftbound origins',
    ],
  },
];

const SIGNAL_RULES: Array<{ type: CommunitySignalType; patterns: RegExp[] }> = [
  {
    type: 'SCAM_WARNING',
    patterns: [/\bscam\b/i, /oplichting/i, /arnaque/i, /betrug/i],
  },
  {
    type: 'RETAILER_WARNING',
    patterns: [/retailer problem/i, /winkel.*probleem/i, /shop.*problem/i],
  },
  {
    type: 'SELLER_WARNING',
    patterns: [/seller complaint/i, /verkoper.*klacht/i, /vendeur.*probl/i],
  },
  {
    type: 'REPRINT_CONFIRMED_REFERENCE',
    patterns: [
      /official.*reprint/i,
      /reprint.*confirmed/i,
      /offici[eë]l.*herdruk/i,
    ],
  },
  {
    type: 'REPRINT_RUMOR',
    patterns: [
      /\breprint\b/i,
      /wave 2/i,
      /second wave/i,
      /herdruk/i,
      /nachdr/i,
      /réimpression/i,
    ],
  },
  {
    type: 'PRICE_DROP_REPORT',
    patterns: [
      /price drop/i,
      /prijsdaling/i,
      /prix en baisse/i,
      /preis gesenkt/i,
    ],
  },
  {
    type: 'SOLD_OUT_REPORT',
    patterns: [
      /sold out/i,
      /\boos\b/i,
      /uitverkocht/i,
      /épuisé/i,
      /ausverkauft/i,
    ],
  },
  {
    type: 'RESTOCK_REPORT',
    patterns: [
      /restock(?:ed)?/i,
      /back in stock/i,
      /back up/i,
      /weer op voorraad/i,
      /nachschub/i,
      /de nouveau en stock/i,
    ],
  },
  {
    type: 'LOCAL_STOCK_REPORT',
    patterns: [/local store/i, /in de winkel/i, /filiale/i, /magasin/i],
  },
  {
    type: 'PREORDER_REPORT',
    patterns: [/pre-?order/i, /voorbestel/i, /précommande/i, /vorbestellung/i],
  },
  {
    type: 'BAN_DISCUSSION',
    patterns: [/\bban(?:ned)?\b/i, /verboden kaart/i, /bannissement/i],
  },
  {
    type: 'COMPETITIVE_CATALYST',
    patterns: [/tournament/i, /top ?8/i, /meta deck/i, /championship/i],
  },
  {
    type: 'SUPPLY_SHORTAGE_REPORT',
    patterns: [
      /shortage/i,
      /allocation/i,
      /short printed/i,
      /tekort/i,
      /knappheit/i,
      /pénurie/i,
    ],
  },
  {
    type: 'SUPPLY_EXPANSION_REPORT',
    patterns: [/new wave/i, /more supply/i, /extra voorraad/i, /mehr bestand/i],
  },
  {
    type: 'DEAL_REPORT',
    patterns: [
      /\bdeal\b/i,
      /cheap/i,
      /discount/i,
      /below msrp/i,
      /goedkoop/i,
      /korting/i,
      /rabatt/i,
      /remise/i,
    ],
  },
  {
    type: 'GRADING_DISCUSSION',
    patterns: [/\bpsa\b/i, /\bcgc\b/i, /grading/i, /grade candidate/i],
  },
  {
    type: 'COLLECTION_FLIP',
    patterns: [/collection sale/i, /collection flip/i, /collectie te koop/i],
  },
  {
    type: 'PRICE_HYPE',
    patterns: [/\bmoon\b/i, /market moving/i, /buyout/i, /price.*explode/i],
  },
  {
    type: 'INVESTMENT_HYPE',
    patterns: [
      /undervalued/i,
      /investment/i,
      /investering/i,
      /long term hold/i,
    ],
  },
  {
    type: 'NEW_PRODUCT_REPORT',
    patterns: [/new product/i, /just announced/i, /nieuw product/i],
  },
];

const OFFICIAL_HOSTS = new Set([
  'www.pokemon.com',
  'pokemon.com',
  'www.pokemoncenter.com',
  'pokemoncenter.com',
  'riftbound.leagueoflegends.com',
  'www.riotgames.com',
  'riotgames.com',
]);

const MARKETPLACE_HOSTS = new Set([
  'amazon.nl',
  'www.amazon.nl',
  'amazon.de',
  'www.amazon.de',
  'amazon.fr',
  'www.amazon.fr',
  'amazon.it',
  'www.amazon.it',
  'amazon.es',
  'www.amazon.es',
  'amazon.com.be',
  'www.amazon.com.be',
  'ebay.nl',
  'www.ebay.nl',
  'ebay.de',
  'www.ebay.de',
  'ebay.com',
  'www.ebay.com',
  'marktplaats.nl',
  'www.marktplaats.nl',
  'cardmarket.com',
  'www.cardmarket.com',
]);

const RETAILER_HOSTS = new Set<string>();

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normaliseCommunityText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12_000);
}

export function redactPersonalData(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[redacted phone]')
    .slice(0, 280);
}

export function extractProductCandidates(text: string): ProductCandidate[] {
  const normal = normaliseCommunityText(text).toLocaleLowerCase('en-US');
  return COMMUNITY_PRODUCT_DICTIONARY.flatMap((entry) => {
    const alias = [...entry.aliases]
      .sort((a, b) => b.length - a.length)
      .find((value) => normal.includes(value.toLocaleLowerCase('en-US')));
    if (!alias) return [];
    const specific = alias.split(/\s+/).length >= 2;
    const productTypePresent =
      /\b(etb|booster|display|box|bundle|starter)\b/i.test(normal);
    return [
      {
        canonicalProductId: entry.canonicalProductId,
        game: entry.game,
        set: entry.set,
        product: entry.product,
        productType: entry.productType,
        confidence: clampScore(
          65 + (specific ? 20 : 0) + (productTypePresent ? 10 : 0),
        ),
        matchedAlias: alias,
      },
    ];
  }).sort((a, b) => b.confidence - a.confidence);
}

export function extractPrice(text: string): {
  price: number | null;
  currency: 'EUR' | 'GBP' | 'USD' | null;
} {
  const matches = normaliseCommunityText(text).match(
    /(?:€|eur\s*|£|gbp\s*|\$|usd\s*)(\d{1,5}(?:[.,]\d{1,2})?)|(?:\b(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur|£|gbp|\$|usd)\b)/i,
  );
  if (!matches) return { price: null, currency: null };
  const raw = matches[1] ?? matches[2];
  const price = Number(raw.replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0 || price > 100_000)
    return { price: null, currency: null };
  const token = matches[0].toLowerCase();
  const currency =
    token.includes('£') || token.includes('gbp')
      ? 'GBP'
      : token.includes('$') || token.includes('usd')
        ? 'USD'
        : 'EUR';
  return { price: Math.round(price * 100) / 100, currency };
}

export function isCommunityFetchAllowed(
  hostname: string,
  configuredRetailers: string[] = [],
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (
    MARKETPLACE_HOSTS.has(host) ||
    OFFICIAL_HOSTS.has(host) ||
    RETAILER_HOSTS.has(host) ||
    configuredRetailers.some((item) => {
      const configured = item.toLowerCase().trim().replace(/\.$/, '');
      return (
        Boolean(configured) &&
        (host === configured || host.endsWith(`.${configured}`))
      );
    })
  );
}

export function extractUrls(
  text: string,
  configuredRetailers: string[] = [],
): ExtractedUrl[] {
  const candidates =
    normaliseCommunityText(text).match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(candidates)].slice(0, 8).flatMap((candidate) => {
    try {
      const url = new URL(candidate.replace(/[),.;!?]+$/, ''));
      if (url.protocol !== 'https:' || url.username || url.password) return [];
      const hostname = url.hostname.toLowerCase();
      const evidenceRole = MARKETPLACE_HOSTS.has(hostname)
        ? 'marketplace'
        : OFFICIAL_HOSTS.has(hostname)
          ? 'official'
          : isCommunityFetchAllowed(hostname, configuredRetailers)
            ? 'retailer'
            : 'unknown';
      return [
        {
          url: url.toString(),
          hostname,
          fetchAllowed: evidenceRole !== 'unknown',
          evidenceRole,
        } as ExtractedUrl,
      ];
    } catch {
      return [];
    }
  });
}

export function classifySignal(
  text: string,
  urls: ExtractedUrl[] = [],
): CommunitySignalType {
  const normal = normaliseCommunityText(text);
  const rule = SIGNAL_RULES.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(normal)),
  );
  if (
    rule?.type === 'REPRINT_CONFIRMED_REFERENCE' &&
    !urls.some((url) => url.evidenceRole === 'official')
  ) {
    return 'REPRINT_RUMOR';
  }
  if (
    rule?.type === 'REPRINT_RUMOR' &&
    urls.some((url) => url.evidenceRole === 'official')
  ) {
    return 'REPRINT_CONFIRMED_REFERENCE';
  }
  if (rule) return rule.type;
  if (urls.some((url) => url.evidenceRole === 'official'))
    return 'OFFICIAL_NEWS_REFERENCE';
  return 'GENERAL_SENTIMENT';
}

export function classifySentiment(text: string): CommunitySentiment {
  const normal = normaliseCommunityText(text).toLowerCase();
  const positive = (
    normal.match(
      /\b(great|amazing|good|love|win|cheap|restock|available|top|sterk|goed)\b/g,
    ) ?? []
  ).length;
  const negative = (
    normal.match(
      /\b(bad|awful|scam|avoid|broken|complaint|overpriced|sold out|slecht|oplichting)\b/g,
    ) ?? []
  ).length;
  if (positive && negative) return 'MIXED';
  if (positive >= 3) return 'VERY_POSITIVE';
  if (positive) return 'POSITIVE';
  if (negative >= 3) return 'VERY_NEGATIVE';
  if (negative) return 'NEGATIVE';
  return 'NEUTRAL';
}

export function classifyIntent(
  text: string,
  signalType?: CommunitySignalType,
): CommunityIntent {
  const normal = normaliseCommunityText(text).toLowerCase();
  if (/looking for|where.*stock|zoek|suche|cherche/.test(normal))
    return 'LOOKING_FOR_STOCK';
  if (/sell|selling|for sale|te koop|verkopen/.test(normal)) return 'SELLING';
  if (/play|deck|tournament|meta/.test(normal)) return 'PLAYING';
  if (/grade|psa|cgc/.test(normal)) return 'COLLECTING';
  if (/complaint|avoid|problem|scam/.test(normal)) return 'COMPLAINING';
  if (/invest|hold|undervalued|moon|pump/.test(normal)) return 'INVESTING';
  if (signalType === 'DEAL_REPORT' || signalType === 'RESTOCK_REPORT')
    return 'BUYING';
  return 'SPECULATING';
}

export function extractRetailerAndMarketplace(
  text: string,
  urls: ExtractedUrl[],
) {
  const normal = normaliseCommunityText(text).toLowerCase();
  const marketplaces: Array<[RegExp, string]> = [
    [/amazon\s*(de|germany)|amazon\.de/i, 'Amazon DE'],
    [/amazon\s*(nl|netherlands)|amazon\.nl/i, 'Amazon NL'],
    [/amazon\s*(fr|france)|amazon\.fr/i, 'Amazon FR'],
    [/amazon\s*(it|italy)|amazon\.it/i, 'Amazon IT'],
    [/amazon\s*(es|spain)|amazon\.es/i, 'Amazon ES'],
    [/amazon\s*(be|belgium)|amazon\.com\.be/i, 'Amazon BE'],
    [/cardmarket/i, 'Cardmarket'],
    [/marktplaats/i, 'Marktplaats'],
    [/\bebay\b/i, 'eBay'],
  ];
  const marketplace =
    marketplaces.find(([pattern]) => pattern.test(normal))?.[1] ??
    urls.find((url) => url.evidenceRole === 'marketplace')?.hostname ??
    null;
  const retailerMatch = normal.match(
    /(?:at|bij|chez|bei)\s+([\p{L}\p{N}][\p{L}\p{N} .&'-]{1,40})/u,
  );
  return { marketplace, retailer: retailerMatch?.[1]?.trim() ?? null };
}

export function extractRegion(text: string) {
  const normal = normaliseCommunityText(text).toLowerCase();
  const countryRules: Array<[RegExp, string]> = [
    [/\b(nl|netherlands|nederland|dutch)\b/i, 'NL'],
    [/\b(de|germany|duitsland|deutschland)\b/i, 'DE'],
    [/\b(be|belgium|belgië|belgique)\b/i, 'BE'],
    [/\b(fr|france)\b/i, 'FR'],
    [/\b(it|italy|italia)\b/i, 'IT'],
    [/\b(es|spain|españa)\b/i, 'ES'],
    [/\b(uk|united kingdom|britain)\b/i, 'GB'],
  ];
  const country =
    countryRules.find(([pattern]) => pattern.test(normal))?.[1] ?? null;
  const region =
    normal.match(
      /\b(amsterdam|rotterdam|utrecht|eindhoven|berlin|hamburg|paris|lyon|brussels|antwerp)\b/i,
    )?.[1] ?? null;
  return { country, region };
}

export function extractLanguage(text: string): string | null {
  const normal = normaliseCommunityText(text);
  if (/\b(english|eng|en)\b/i.test(normal)) return 'English';
  if (/\b(dutch|nederlands|nl)\b/i.test(normal)) return 'Dutch';
  if (/\b(german|deutsch|de)\b/i.test(normal)) return 'German';
  if (/\b(french|français|fr)\b/i.test(normal)) return 'French';
  return null;
}

export function extractQuantity(text: string): number | null {
  const match = normaliseCommunityText(text).match(
    /\b(\d{1,3})\s*(?:x|boxes?|displays?|etbs?|bundles?|packs?|left|available|op voorraad)\b/i,
  );
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 999
    ? quantity
    : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function pseudonymizeAuthorId(
  platform: CommunityPlatform,
  externalId: string,
  salt: string,
): Promise<string> {
  return `author:${(await sha256(`${platform}:${salt}:${externalId}`)).slice(0, 24)}`;
}

export async function normaliseCommunitySignal(
  input: CommunitySourceInput,
  options: {
    authorSalt: string;
    rawRetentionHours?: number;
    configuredRetailers?: string[];
    now?: number;
  },
): Promise<NormalisedCommunitySignal | null> {
  const text = normaliseCommunityText(input.text);
  if (!text || text.length > 12_000) return null;
  const productCandidates = extractProductCandidates(text);
  const product = productCandidates[0] ?? null;
  const urls = extractUrls(text, options.configuredRetailers);
  const signalType = classifySignal(text, urls);
  const { price, currency } = extractPrice(text);
  const { marketplace, retailer } = extractRetailerAndMarketplace(text, urls);
  const { country, region } = extractRegion(text);
  const factualEntityCount = [
    product,
    price,
    marketplace,
    retailer,
    country,
    ...urls,
  ].filter(Boolean).length;
  const specificity = signalType === 'GENERAL_SENTIMENT' ? 0 : 15;
  const confidence = clampScore(
    (product?.confidence ?? 25) +
      specificity +
      Math.min(15, factualEntityCount * 3) -
      (productCandidates.length > 1 ? 20 : 0),
  );
  const now = options.now ?? Date.now();
  const retentionHours = Math.max(
    1,
    Math.min(168, options.rawRetentionHours ?? 24),
  );
  const officialReference = urls.some((url) => url.evidenceRole === 'official');
  const textHash = await sha256(text.toLocaleLowerCase('en-US'));
  return {
    id: `${input.platform}:${input.externalId}`,
    platform: input.platform,
    community: input.community.slice(0, 200),
    channel: input.channel?.slice(0, 200) ?? null,
    externalId: input.externalId.slice(0, 200),
    occurredAt: input.occurredAt,
    canonicalProductId: product?.canonicalProductId ?? null,
    game: product?.game ?? null,
    set: product?.set ?? null,
    product: product?.product ?? null,
    productType: product?.productType ?? null,
    signalType,
    price,
    currency,
    retailer,
    marketplace,
    country,
    region,
    language: extractLanguage(text),
    quantity: extractQuantity(text),
    urls,
    sentiment: classifySentiment(text),
    intent: classifyIntent(text, signalType),
    confidence,
    authorReliabilityId: input.authorExternalId
      ? await pseudonymizeAuthorId(
          input.platform,
          input.authorExternalId,
          options.authorSalt,
        )
      : null,
    verificationStatus: 'unverified',
    officialReference,
    unresolved: !product || product.confidence < 70,
    textHash,
    rawExcerpt: redactPersonalData(text),
    rawExpiresAt: new Date(now + retentionHours * 3_600_000).toISOString(),
    score: input.score ?? null,
    commentCount: input.commentCount ?? null,
  };
}

export function mentionAcceleration(
  current24h: number,
  sevenDayTotal: number,
): number {
  if (current24h <= 0) return 0;
  const baselineDaily = Math.max(1, (sevenDayTotal - current24h) / 6);
  return Math.round(((current24h - baselineDaily) / baselineDaily) * 100);
}

export function communityMomentumScore(input: MomentumInput): number {
  const uniqueAuthorScore = Math.min(
    100,
    Math.sqrt(Math.max(0, input.uniqueAuthors)) * 12,
  );
  const communityScore = Math.min(
    100,
    Math.max(0, input.uniqueCommunities) * 18,
  );
  const base =
    Math.min(100, Math.max(0, input.mentionVelocity)) * 0.25 +
    uniqueAuthorScore * 0.2 +
    communityScore * 0.15 +
    clampScore(input.sourceReliability) * 0.15 +
    Math.min(100, Math.max(0, input.actionableRatio * 100)) * 0.1 +
    Math.min(100, Math.max(0, input.sentimentShift)) * 0.1 +
    Math.min(100, Math.max(0, input.linkDiversity)) * 0.05;
  const penalty =
    Math.max(0, input.repeatedTextRatio ?? 0) * 25 +
    Math.max(0, (input.singleSourceRatio ?? 0) - 0.65) * 35 +
    Math.max(0, (input.lowHistoryAuthorRatio ?? 0) - 0.7) * 20;
  return clampScore(base - penalty);
}

export function signalDivergenceScore(input: {
  communityMomentum: number;
  priceMomentum: number | null;
  sellerCountMomentum: number | null;
  stockBreadthMomentum: number | null;
  independentCommunities: number;
}): number {
  if (input.priceMomentum === null)
    return clampScore(input.communityMomentum * 0.55);
  const priceResponse = Math.min(100, Math.max(0, input.priceMomentum * 4));
  const sellerContraction =
    input.sellerCountMomentum === null
      ? 0
      : Math.min(20, Math.max(-20, -input.sellerCountMomentum * 0.6));
  const stockContraction =
    input.stockBreadthMomentum === null
      ? 0
      : Math.min(20, Math.max(-20, -input.stockBreadthMomentum * 0.6));
  const confirmation = Math.min(
    15,
    Math.max(0, input.independentCommunities - 1) * 4,
  );
  return clampScore(
    input.communityMomentum -
      priceResponse * 0.55 +
      sellerContraction +
      stockContraction +
      confirmation,
  );
}

export function hypeRiskScore(input: HypeRiskInput): number {
  let score =
    Math.min(100, Math.max(0, input.mentionAcceleration)) * 0.18 +
    clampScore(input.lowHistoryAuthorRatio * 100) * 0.2 +
    clampScore(input.repeatedTextRatio * 100) * 0.18 +
    clampScore(input.repeatedLinkRatio * 100) * 0.12 +
    clampScore(input.dominantSourceRatio * 100) * 0.12 +
    clampScore(input.crossPostRatio * 100) * 0.1;
  const marketFlat = Math.abs(input.marketplaceSalesMomentum ?? 0) < 3;
  const supplyFlat = Math.abs(input.sellerCountMomentum ?? 0) < 3;
  if (marketFlat) score += 5;
  if (supplyFlat) score += 5;
  if ((input.priceMomentum ?? 0) > 25) score += 8;
  return clampScore(score);
}

export function hypeRiskLabel(
  score: number,
): 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' {
  if (score >= 75) return 'HIGH';
  if (score >= 55) return 'ELEVATED';
  if (score >= 30) return 'MODERATE';
  return 'LOW';
}

export function authorReliabilityScore(input: {
  verified: number;
  false: number;
  expired?: number;
}): number | null {
  const total = input.verified + input.false + (input.expired ?? 0);
  if (!total) return null;
  return clampScore(((input.verified + 1) / (total + 2)) * 100);
}

export function sourceReliabilityScore(input: {
  verified: number;
  false: number;
  medianLeadMinutes?: number | null;
}): number | null {
  const base = authorReliabilityScore(input);
  if (base === null) return null;
  const leadBonus =
    input.medianLeadMinutes === null || input.medianLeadMinutes === undefined
      ? 0
      : Math.max(-5, Math.min(8, input.medianLeadMinutes / 10));
  return clampScore(base + leadBonus);
}

export function calculateLeadTimeMinutes(
  communityDetectedAt: string,
  marketDetectedAt: string,
): number | null {
  const community = Date.parse(communityDetectedAt);
  const market = Date.parse(marketDetectedAt);
  if (!Number.isFinite(community) || !Number.isFinite(market)) return null;
  return Math.round((market - community) / 60_000);
}

export function signalAgeMinutes(
  occurredAt: string,
  now = Date.now(),
): number | null {
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - occurred) / 60_000));
}

export function classifyEarlySignal(input: {
  communityMomentum: number;
  priceMomentum: number | null;
  sellerCountMomentum: number | null;
  stockBreadthMomentum: number | null;
  hypeRisk: number;
  verified: boolean;
}): EarlySignalClassification {
  if (
    input.priceMomentum === null &&
    input.sellerCountMomentum === null &&
    input.stockBreadthMomentum === null
  )
    return 'INSUFFICIENT_DATA';
  if (
    input.communityMomentum >= 70 &&
    input.hypeRisk >= 70 &&
    Math.abs(input.priceMomentum ?? 0) < 5
  )
    return 'HYPE_WITHOUT_MARKET_SUPPORT';
  if (
    (input.sellerCountMomentum ?? 0) > 15 ||
    (input.stockBreadthMomentum ?? 0) > 15
  )
    return 'SUPPLY_EXPANSION';
  if (
    (input.sellerCountMomentum ?? 0) < -15 ||
    (input.stockBreadthMomentum ?? 0) < -15
  ) {
    if (
      input.communityMomentum >= 65 &&
      Math.abs(input.priceMomentum ?? 0) < 15
    )
      return 'EARLY_SIGNAL';
    return 'SUPPLY_CONTRACTION';
  }
  if (input.communityMomentum >= 75 && (input.priceMomentum ?? 0) >= 30)
    return 'PRICED_IN';
  if (
    input.verified &&
    input.communityMomentum >= 60 &&
    (input.priceMomentum ?? 0) >= 8
  )
    return 'CONFIRMED_MOVE';
  if (input.communityMomentum >= 70 && Math.abs(input.priceMomentum ?? 0) < 8)
    return 'EARLY_SIGNAL';
  if (input.communityMomentum >= 60 && (input.priceMomentum ?? 0) < -10)
    return 'CONFLICTING_SIGNALS';
  return 'INSUFFICIENT_DATA';
}

export function communityDealAdjustment(input: {
  momentum: number;
  divergence: number;
  reliability: number;
  hypeRisk: number;
}): number {
  const raw =
    (input.momentum - 50) * 0.08 +
    (input.divergence - 50) * 0.08 +
    (input.reliability - 50) * 0.04 -
    Math.max(0, input.hypeRisk - 40) * 0.1;
  return Math.max(-10, Math.min(10, Math.round(raw)));
}

export function clusterCommunitySignals(
  signals: NormalisedCommunitySignal[],
  windowMinutes = 15,
) {
  const ordered = [...signals].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const clusters: Array<{
    id: string;
    signals: NormalisedCommunitySignal[];
    canonicalProductId: string | null;
    platforms: CommunityPlatform[];
    communities: string[];
  }> = [];
  for (const signal of ordered) {
    const rounded = Math.floor(
      Date.parse(signal.occurredAt) / (windowMinutes * 60_000),
    );
    const priceKey =
      signal.price === null
        ? 'none'
        : Math.round(signal.price * 100).toString();
    const retailerKey =
      signal.marketplace ??
      signal.retailer ??
      signal.urls[0]?.hostname ??
      'unknown';
    const key = `${signal.canonicalProductId ?? 'unresolved'}:${retailerKey}:${priceKey}:${rounded}`;
    let cluster = clusters.find((candidate) => candidate.id === key);
    if (!cluster) {
      cluster = {
        id: key,
        signals: [],
        canonicalProductId: signal.canonicalProductId,
        platforms: [],
        communities: [],
      };
      clusters.push(cluster);
    }
    if (!cluster.signals.some((candidate) => candidate.id === signal.id))
      cluster.signals.push(signal);
    if (!cluster.platforms.includes(signal.platform))
      cluster.platforms.push(signal.platform);
    if (!cluster.communities.includes(signal.community))
      cluster.communities.push(signal.community);
  }
  return clusters;
}

export function canCommunityCreateBuyRecommendation(input: {
  hasVerifiedMarketEvidence: boolean;
  conservativeProfit: number | null;
  roi: number | null;
}): boolean {
  return (
    input.hasVerifiedMarketEvidence &&
    (input.conservativeProfit ?? -Infinity) > 0 &&
    (input.roi ?? -Infinity) > 0
  );
}

export function safeCommunityExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
