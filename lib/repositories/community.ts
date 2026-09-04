import {
  classifyEarlySignal,
  clusterCommunitySignals,
  canCommunityCreateBuyRecommendation,
  communityMomentumScore,
  hypeRiskLabel,
  hypeRiskScore,
  mentionAcceleration,
  signalDivergenceScore,
  type CommunityDashboard,
  type CommunityProductRadar,
  type CommunitySourceStatus,
  type NormalisedCommunitySignal,
} from '../community.ts';
import {
  communityFixtureDashboard,
  communityFixtureSignals,
} from '../fixtures-community.ts';
import { amazonFixtureDashboard } from '../fixtures-amazon.ts';
import { createAmazonShadowTrade } from './amazon.ts';
import { ensureUser } from './user-state.ts';
import type { RequestUser } from '../server/user.ts';

type CommunityConnectionState = {
  redditCredentialsAvailable: boolean;
  discordCredentialsAvailable: boolean;
};

type ScanRunSummary = {
  id: string;
  platform: 'reddit' | 'discord';
  status: string;
  startedAt: number;
  finishedAt: number;
  eventsReceived: number;
  messagesFiltered: number;
  signalsCreated: number;
  duplicatesClustered: number;
  productsMatched: number;
  rateLimitRemaining: number | null;
  errorCode: string | null;
  errorDetail: string | null;
};

export type CommunityScanPersistence = ScanRunSummary & {
  signals: NormalisedCommunitySignal[];
  sourceNames?: Record<string, string>;
  cursors?: Record<string, unknown>;
};

export type CommunityVerificationResult = {
  status:
    | 'confirmed'
    | 'not_confirmed'
    | 'price_changed'
    | 'out_of_stock'
    | 'wrong_product';
  marketSource: string;
  marketListingId?: string | null;
  marketUrl?: string | null;
  marketVerifiedAt: string;
  itemPrice: number | null;
  deliveredPrice?: number | null;
  conservativeExit?: number | null;
  predictedProfit?: number | null;
  roi?: number | null;
  confidenceGrade?: string | null;
  detail: string;
};

const COMMUNITY_ALERT_TYPES = [
  'COMMUNITY_EARLY_SIGNAL',
  'COMMUNITY_CONFIRMED_DEAL',
  'COMMUNITY_RESTOCK_CLUSTER',
  'COMMUNITY_SUPPLY_WARNING',
  'COMMUNITY_REPRINT_RUMOR',
  'COMMUNITY_HYPE_WARNING',
  'COMMUNITY_OFFICIAL_REFERENCE',
] as const;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceIdFor(
  signal: Pick<NormalisedCommunitySignal, 'platform' | 'community' | 'channel'>,
) {
  return `community-source:${signal.platform}:${stableId(`${signal.community}:${signal.channel ?? ''}`)}`;
}

function productFallback(signal: NormalisedCommunitySignal) {
  return {
    id: signal.canonicalProductId!,
    game: signal.game ?? 'Unknown TCG',
    setName: signal.set ?? 'Community unresolved',
    name: signal.product ?? signal.canonicalProductId!,
    slug: `community-${stableId(signal.canonicalProductId!)}`,
    productType: signal.productType ?? 'unknown',
    language: signal.language ?? 'Unknown',
  };
}

function signalEntities(signal: NormalisedCommunitySignal) {
  const candidates: Array<{ kind: string; value: string | number | null }> = [
    { kind: 'canonical_product', value: signal.canonicalProductId },
    { kind: 'game', value: signal.game },
    { kind: 'set', value: signal.set },
    { kind: 'product_type', value: signal.productType },
    { kind: 'price', value: signal.price },
    { kind: 'currency', value: signal.currency },
    { kind: 'retailer', value: signal.retailer },
    { kind: 'marketplace', value: signal.marketplace },
    { kind: 'country', value: signal.country },
    { kind: 'region', value: signal.region },
    { kind: 'language', value: signal.language },
    { kind: 'quantity', value: signal.quantity },
    ...signal.urls.map((url) => ({ kind: 'url', value: url.url })),
  ];
  return candidates.flatMap((entity, index) =>
    entity.value === null
      ? []
      : [
          {
            id: `community-entity:${stableId(`${signal.id}:${entity.kind}:${index}`)}`,
            ...entity,
          },
        ],
  );
}

function mapCommunitySourceRow(
  row: Record<string, unknown>,
): CommunitySourceStatus {
  return {
    id: stringValue(row.id),
    platform: stringValue(row.platform) as 'reddit' | 'discord',
    name: stringValue(row.name),
    enabled: Boolean(row.enabled),
    games: parseJson(row.games_json, []),
    categories: parseJson(row.categories_json, []),
    reliability:
      row.reliability_score_bps === null ||
      row.reliability_score_bps === undefined
        ? null
        : Number(row.reliability_score_bps) / 100,
    status: stringValue(row.status) as CommunitySourceStatus['status'],
    lastSignalAt: row.last_signal_at
      ? new Date(Number(row.last_signal_at)).toISOString()
      : null,
    lastError: row.last_error ? stringValue(row.last_error) : null,
    guildId:
      row.platform === 'discord'
        ? stringValue(row.external_community_id)
        : null,
    channelId: row.external_channel_id
      ? stringValue(row.external_channel_id)
      : null,
    messageContentAvailable: null,
    scanIntervalMinutes: row.platform === 'reddit' ? 15 : null,
    processedToday: Number(row.signals_submitted ?? 0),
    signalsToday: 0,
    rateLimitRemaining: null,
    medianLeadMinutes:
      row.median_lead_minutes === null || row.median_lead_minutes === undefined
        ? null
        : Number(row.median_lead_minutes),
    dataMode: 'production',
  };
}

export async function listCommunityDashboard(
  db: D1Database,
  connection: CommunityConnectionState,
): Promise<CommunityDashboard> {
  const [momentum, signals, sourceRows, scanRows, performanceRows] =
    await Promise.all([
      db
        .prepare(
          `SELECT community_product_momentum.*, products.name, products.game
           FROM community_product_momentum
           INNER JOIN products
             ON products.id = community_product_momentum.canonical_product_id
           WHERE community_product_momentum.data_mode = 'production'
           ORDER BY community_product_momentum.calculated_at DESC,
                    community_product_momentum.momentum_score DESC
           LIMIT 30`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT community_signals.*, community_sources.name AS source_name
           FROM community_signals
           INNER JOIN community_sources
             ON community_sources.id = community_signals.source_id
           WHERE community_signals.data_mode = 'production'
           ORDER BY community_signals.occurred_at DESC
           LIMIT 50`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT community_sources.*, community_source_reliability.median_lead_minutes,
                  community_source_reliability.signals_submitted,
                  community_source_reliability.signals_verified
           FROM community_sources
           LEFT JOIN community_source_reliability
             ON community_source_reliability.source_id = community_sources.id
           WHERE community_sources.data_mode = 'production'
           ORDER BY community_sources.enabled DESC, community_sources.name`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT * FROM community_scan_runs
           ORDER BY started_at DESC LIMIT 20`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS verified,
             SUM(CASE WHEN status = 'confirmed'
                           AND predicted_profit_cents > 0 THEN 1 ELSE 0 END) AS profitable,
             SUM(CASE WHEN status IN ('not_confirmed', 'wrong_product') THEN 1 ELSE 0 END) AS rejected,
             AVG(CASE WHEN market_verified_at IS NOT NULL
               THEN (market_verified_at - community_detected_at) / 60000.0 END) AS verification_minutes,
             AVG(CASE WHEN price_at_community_detection_cents > 0
                           AND price_at_verification_cents IS NOT NULL
               THEN (price_at_verification_cents - price_at_community_detection_cents) * 1.0 /
                    price_at_community_detection_cents END) AS price_move
           FROM community_verifications
           WHERE data_mode = 'production'`,
        )
        .all<Record<string, unknown>>(),
    ]);

  if (!momentum.results.length && !signals.results.length) {
    const fixture = communityFixtureDashboard();
    const configuredSources = sourceRows.results.map(mapCommunitySourceRow);
    return {
      ...fixture,
      reddit: {
        connected: false,
        status: connection.redditCredentialsAvailable
          ? 'configured_unverified'
          : 'credentials_required',
        detail: connection.redditCredentialsAvailable
          ? 'Credentials configured; awaiting an authenticated Reddit scan.'
          : 'Reddit API credentials required. No HTML scraping fallback.',
      },
      discord: {
        connected: false,
        status: connection.discordCredentialsAvailable
          ? 'configured_unverified'
          : 'bot_required',
        detail: connection.discordCredentialsAvailable
          ? 'Bot configured; awaiting a permitted Gateway event and message-content check.'
          : 'Discord bot and explicit guild/channel allowlists are required.',
      },
      sources: [...configuredSources, ...fixture.sources],
    };
  }

  const latestByProduct = new Map<string, Record<string, unknown>>();
  for (const row of momentum.results) {
    const productId = stringValue(row.canonical_product_id);
    if (productId && !latestByProduct.has(productId))
      latestByProduct.set(productId, row);
  }
  const products: CommunityProductRadar[] = [...latestByProduct.values()].map(
    (row) => {
      const metrics = parseJson<Partial<CommunityProductRadar>>(
        row.metrics_json,
        {},
      );
      const hypeRisk = Number(row.hype_risk_score ?? 0);
      return {
        id: stringValue(row.id),
        canonicalProductId: stringValue(row.canonical_product_id),
        game: stringValue(row.game, 'Unknown TCG'),
        product: stringValue(row.name, 'Unknown product'),
        momentumScore: Number(row.momentum_score ?? 0),
        momentumChange: Number(metrics.momentumChange ?? 0),
        redditChange: Number(metrics.redditChange ?? 0),
        discordChange: Number(metrics.discordChange ?? 0),
        uniqueAuthors: Number(row.unique_authors ?? 0),
        uniqueCommunities: Number(row.unique_communities ?? 0),
        priceMomentum: metrics.priceMomentum ?? null,
        sellerCountMomentum: metrics.sellerCountMomentum ?? null,
        stockBreadthMomentum: metrics.stockBreadthMomentum ?? null,
        divergenceScore: Number(row.divergence_score ?? 0),
        hypeRisk,
        hypeRiskLabel: hypeRiskLabel(hypeRisk),
        classification: String(
          row.classification,
        ) as CommunityProductRadar['classification'],
        sourceReliability: Number(metrics.sourceReliability ?? 0),
        mentionCounts: {
          m15: Number(row.mentions_15m ?? 0),
          h1: Number(row.mentions_1h ?? 0),
          h6: Number(row.mentions_6h ?? 0),
          h24: Number(row.mentions_24h ?? 0),
          d7: Number(row.mentions_7d ?? 0),
        },
        signalCounts: metrics.signalCounts ?? {},
        sourceDistribution: metrics.sourceDistribution ?? [],
        timeline: metrics.timeline ?? [],
        conclusion:
          metrics.conclusion ??
          'Community activity requires targeted marketplace verification.',
        verificationStatus: metrics.verificationStatus ?? 'unverified',
        marketEvidence: metrics.marketEvidence ?? {
          itemPrice: null,
          deliveredPrice: null,
          conservativeExit: null,
          estimatedNetProfit: null,
          roi: null,
          confidenceGrade: null,
          sourceUrl: null,
          source: null,
        },
        firstDetectedAt:
          metrics.firstDetectedAt ??
          new Date(Number(row.calculated_at)).toISOString(),
        marketDetectedAt: metrics.marketDetectedAt ?? null,
        leadTimeMinutes: metrics.leadTimeMinutes ?? null,
        dataMode: 'production',
      };
    },
  );

  const recentSignals: NormalisedCommunitySignal[] = signals.results.map(
    (row) => ({
      id: stringValue(row.id),
      platform: stringValue(row.platform) as 'reddit' | 'discord',
      community: stringValue(row.source_name, 'Community source'),
      channel: null,
      externalId: stringValue(row.external_id),
      occurredAt: new Date(Number(row.occurred_at)).toISOString(),
      canonicalProductId: row.canonical_product_id
        ? stringValue(row.canonical_product_id)
        : null,
      game: null,
      set: null,
      product: null,
      productType: null,
      signalType: stringValue(
        row.signal_type,
      ) as NormalisedCommunitySignal['signalType'],
      price:
        row.price_cents === null || row.price_cents === undefined
          ? null
          : Number(row.price_cents) / 100,
      currency: (row.currency as NormalisedCommunitySignal['currency']) ?? null,
      retailer: row.retailer_mention ? stringValue(row.retailer_mention) : null,
      marketplace: row.marketplace_mention
        ? stringValue(row.marketplace_mention)
        : null,
      country: row.country_mention ? stringValue(row.country_mention) : null,
      region: row.region_mention ? stringValue(row.region_mention) : null,
      language: row.language ? stringValue(row.language) : null,
      quantity: row.quantity === null ? null : Number(row.quantity),
      urls: parseJson(row.urls_json, []),
      sentiment: stringValue(
        row.sentiment,
      ) as NormalisedCommunitySignal['sentiment'],
      intent: stringValue(row.intent) as NormalisedCommunitySignal['intent'],
      confidence: Number(row.confidence_bps) / 100,
      authorReliabilityId: row.author_reliability_id
        ? stringValue(row.author_reliability_id)
        : null,
      verificationStatus: stringValue(
        row.verification_status,
      ) as NormalisedCommunitySignal['verificationStatus'],
      officialReference: Boolean(row.official_reference),
      unresolved: Boolean(row.unresolved),
      textHash: stringValue(row.text_hash),
      rawExcerpt: row.raw_excerpt
        ? stringValue(row.raw_excerpt)
        : 'Excerpt expired under the retention policy.',
      rawExpiresAt: row.raw_expires_at
        ? new Date(Number(row.raw_expires_at)).toISOString()
        : new Date(0).toISOString(),
      score: null,
      commentCount: null,
    }),
  );

  const sources: CommunitySourceStatus[] = sourceRows.results.map(
    mapCommunitySourceRow,
  );

  const redditRun = scanRows.results.find((row) => row.platform === 'reddit');
  const discordRun = scanRows.results.find((row) => row.platform === 'discord');
  const perf = performanceRows.results[0] ?? {};
  const verified = Number(perf.verified ?? 0);
  const rejected = Number(perf.rejected ?? 0);
  const verifiable = verified + rejected;
  const signals24h = recentSignals.filter(
    (signal) => Date.parse(signal.occurredAt) >= Date.now() - 86_400_000,
  ).length;
  const bestSource = [...sources]
    .filter((source) => source.medianLeadMinutes !== null)
    .sort(
      (a, b) =>
        (b.medianLeadMinutes ?? -Infinity) - (a.medianLeadMinutes ?? -Infinity),
    )[0];

  return {
    generatedAt: new Date().toISOString(),
    dataMode: 'production',
    reddit: {
      connected: redditRun?.status === 'success',
      status:
        stringValue(redditRun?.status) ||
        (connection.redditCredentialsAvailable
          ? 'configured_unverified'
          : 'credentials_required'),
      detail: redditRun?.error_detail
        ? stringValue(redditRun.error_detail)
        : connection.redditCredentialsAvailable
          ? 'Credentials configured; awaiting an authenticated scan.'
          : 'Reddit API credentials required. No HTML scraping fallback.',
    },
    discord: {
      connected: discordRun?.status === 'connected',
      status:
        stringValue(discordRun?.status) ||
        (connection.discordCredentialsAvailable
          ? 'configured_unverified'
          : 'bot_required'),
      detail: discordRun?.error_detail
        ? stringValue(discordRun.error_detail)
        : connection.discordCredentialsAvailable
          ? 'Bot configured; awaiting a permitted Gateway event.'
          : 'Discord bot and explicit guild/channel allowlists are required.',
    },
    metrics: {
      signals24h,
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
      signalsDetected: Number(perf.total ?? recentSignals.length),
      verifiedRate: verifiable ? verified / verifiable : null,
      falseSignalRate: verifiable ? rejected / verifiable : null,
      medianVerificationMinutes:
        perf.verification_minutes === null ||
        perf.verification_minutes === undefined
          ? null
          : Number(perf.verification_minutes),
      medianLeadMinutes: bestSource?.medianLeadMinutes ?? null,
      profitableConfirmedRate: verified
        ? Number(perf.profitable ?? 0) / verified
        : null,
      averagePriceMove24h:
        perf.price_move === null || perf.price_move === undefined
          ? null
          : Number(perf.price_move),
    },
  };
}

export async function listEnabledRedditSources(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT community_sources.*, community_source_configs.cursor_json,
              community_source_configs.raw_retention_hours
       FROM community_sources
       LEFT JOIN community_source_configs
         ON community_source_configs.source_id = community_sources.id
        AND community_source_configs.user_id IS NULL
       WHERE community_sources.platform = 'reddit'
         AND community_sources.enabled = 1
         AND community_sources.data_mode = 'production'`,
    )
    .all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: stringValue(row.id),
    community: stringValue(row.external_community_id),
    name: stringValue(row.name),
    cursor: parseJson<Record<string, unknown>>(row.cursor_json, {}),
    rawRetentionHours: Number(row.raw_retention_hours ?? 24),
  }));
}

export async function persistCommunityScan(
  db: D1Database,
  run: CommunityScanPersistence,
) {
  const now = Date.now();
  const signals = run.signals.slice(0, 500);
  const clusters = clusterCommunitySignals(signals);
  const statements: D1PreparedStatement[] = [];

  for (const signal of signals) {
    const sourceId = sourceIdFor(signal);
    const sourceName = run.sourceNames?.[signal.community] ?? signal.community;
    statements.push(
      db
        .prepare(
          `INSERT INTO community_sources
            (id, platform, name, external_community_id, external_channel_id,
             enabled, games_json, categories_json, status, last_signal_at,
             data_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'connected', ?, 'production', ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             status = excluded.status,
             last_signal_at = excluded.last_signal_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          sourceId,
          signal.platform,
          sourceName,
          signal.community,
          signal.channel,
          JSON.stringify(signal.game ? [signal.game] : []),
          JSON.stringify([signal.signalType]),
          Date.parse(signal.occurredAt),
          now,
          now,
        ),
    );
    if (signal.canonicalProductId) {
      const product = productFallback(signal);
      statements.push(
        db
          .prepare(
            `INSERT INTO products
              (id, game, set_name, name, slug, product_type, language,
               manually_verified, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
             ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
          )
          .bind(
            product.id,
            product.game,
            product.setName,
            product.name,
            product.slug,
            product.productType,
            product.language,
            now,
            now,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO community_signals
            (id, source_id, external_id, platform, occurred_at,
             canonical_product_id, author_reliability_id, signal_type,
             price_cents, currency, retailer_mention, marketplace_mention,
             country_mention, region_mention, language, quantity, urls_json,
             restock_flag, reprint_flag, release_flag, scarcity_flag,
             fraud_warning_flag, sentiment, intent, confidence_bps,
             verification_status, official_reference, unresolved, text_hash,
             raw_excerpt, raw_expires_at, data_mode, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'production', ?)
           ON CONFLICT(source_id, external_id) DO NOTHING`,
        )
        .bind(
          signal.id,
          sourceId,
          signal.externalId,
          signal.platform,
          Date.parse(signal.occurredAt),
          signal.canonicalProductId,
          signal.authorReliabilityId,
          signal.signalType,
          signal.price === null ? null : Math.round(signal.price * 100),
          signal.currency,
          signal.retailer,
          signal.marketplace,
          signal.country,
          signal.region,
          signal.language,
          signal.quantity,
          JSON.stringify(signal.urls),
          signal.signalType === 'RESTOCK_REPORT' ? 1 : 0,
          signal.signalType.includes('REPRINT') ? 1 : 0,
          signal.signalType.includes('RELEASE') ? 1 : 0,
          signal.signalType.includes('SHORTAGE') ||
            signal.signalType === 'SOLD_OUT_REPORT'
            ? 1
            : 0,
          signal.signalType.includes('WARNING') ? 1 : 0,
          signal.sentiment,
          signal.intent,
          Math.round(signal.confidence * 100),
          signal.verificationStatus,
          signal.officialReference ? 1 : 0,
          signal.unresolved ? 1 : 0,
          signal.textHash,
          signal.rawExcerpt,
          Date.parse(signal.rawExpiresAt),
          now,
        ),
    );
    for (const entity of signalEntities(signal)) {
      statements.push(
        db
          .prepare(
            `INSERT INTO community_signal_entities
              (id, signal_id, kind, value, confidence_bps,
               evidence_start, evidence_end)
             VALUES (?, ?, ?, ?, ?, NULL, NULL)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            entity.id,
            signal.id,
            entity.kind,
            String(entity.value),
            Math.round(signal.confidence * 100),
          ),
      );
    }
    if (signal.unresolved && signal.confidence >= 30) {
      statements.push(
        db
          .prepare(
            `INSERT INTO review_queue
              (id, source_id, kind, severity, payload_json, status,
               data_mode, created_at)
             VALUES (?, ?, 'community_product_match', ?, ?, 'open',
               'production', ?)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            `review:${signal.id}`,
            sourceId,
            signal.price !== null || signal.signalType !== 'GENERAL_SENTIMENT'
              ? 'medium'
              : 'low',
            JSON.stringify({
              signalId: signal.id,
              signalType: signal.signalType,
              excerpt: signal.rawExcerpt,
              confidence: signal.confidence,
            }),
            now,
          ),
      );
    }
  }

  for (const cluster of clusters) {
    const first = cluster.signals[0];
    const last = cluster.signals.at(-1) ?? first;
    const eventId = `community-event:${stableId(cluster.id)}`;
    statements.push(
      db
        .prepare(
          `INSERT INTO community_signal_events
            (id, dedupe_key, canonical_product_id, signal_type, retailer,
             marketplace, price_cents, currency, first_detected_at,
             last_detected_at, mention_count, unique_author_count,
             unique_community_count, platforms_json, source_ids_json,
             verification_status, data_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   'production', ?, ?)
           ON CONFLICT(dedupe_key) DO UPDATE SET
             last_detected_at = MAX(last_detected_at, excluded.last_detected_at),
             mention_count = MAX(mention_count, excluded.mention_count),
             unique_author_count = MAX(unique_author_count, excluded.unique_author_count),
             unique_community_count = MAX(unique_community_count, excluded.unique_community_count),
             platforms_json = excluded.platforms_json,
             source_ids_json = excluded.source_ids_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          eventId,
          cluster.id,
          cluster.canonicalProductId,
          first.signalType,
          first.retailer,
          first.marketplace,
          first.price === null ? null : Math.round(first.price * 100),
          first.currency,
          Date.parse(first.occurredAt),
          Date.parse(last.occurredAt),
          cluster.signals.length,
          new Set(
            cluster.signals
              .map((signal) => signal.authorReliabilityId)
              .filter(Boolean),
          ).size,
          cluster.communities.length,
          JSON.stringify(cluster.platforms),
          JSON.stringify(cluster.signals.map((signal) => sourceIdFor(signal))),
          first.verificationStatus,
          now,
          now,
        ),
    );
    for (const signal of cluster.signals) {
      statements.push(
        db
          .prepare(
            `INSERT INTO community_event_signals
              (event_id, signal_id, created_at)
             VALUES (?, ?, ?)
             ON CONFLICT(event_id, signal_id) DO NOTHING`,
          )
          .bind(eventId, signal.id, now),
      );
    }
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO community_scan_runs
          (id, platform, status, started_at, finished_at, events_received,
           messages_filtered, signals_created, duplicates_clustered,
           products_matched, signals_verified, signals_rejected,
           alerts_emitted, rate_limit_remaining, classification_latency_ms,
           error_code, error_detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, ?, ?)`,
      )
      .bind(
        run.id,
        run.platform,
        run.status,
        run.startedAt,
        run.finishedAt,
        run.eventsReceived,
        run.messagesFiltered,
        signals.length,
        Math.max(0, signals.length - clusters.length),
        signals.filter((signal) => signal.canonicalProductId).length,
        run.rateLimitRemaining,
        run.errorCode,
        run.errorDetail,
      ),
  );

  if (statements.length) {
    for (let index = 0; index < statements.length; index += 80) {
      await db.batch(statements.slice(index, index + 80));
    }
  }
  await db
    .prepare(
      `UPDATE community_signals
       SET raw_excerpt = NULL
       WHERE raw_expires_at IS NOT NULL AND raw_expires_at < ?`,
    )
    .bind(now)
    .run();
  return {
    signalsCreated: signals.length,
    duplicatesClustered: Math.max(0, signals.length - clusters.length),
    clustersCreated: clusters.length,
  };
}

export async function recalculateCommunityMomentum(
  db: D1Database,
  canonicalProductId: string,
  now = Date.now(),
) {
  const result = await db
    .prepare(
      `SELECT community_signals.occurred_at,
              community_signals.author_reliability_id,
              community_signals.signal_type,
              community_signals.sentiment,
              community_signals.text_hash,
              community_signals.urls_json,
              community_signals.source_id,
              community_sources.external_community_id,
              community_sources.platform,
              community_sources.reliability_score_bps
       FROM community_signals
       INNER JOIN community_sources
         ON community_sources.id = community_signals.source_id
       WHERE community_signals.canonical_product_id = ?
         AND community_signals.data_mode = 'production'
         AND community_signals.occurred_at >= ?`,
    )
    .bind(canonicalProductId, now - 7 * 86_400_000)
    .all<Record<string, unknown>>();
  const rows = result.results;
  if (!rows.length) return null;
  const since = (minutes: number) =>
    rows.filter((row) => Number(row.occurred_at) >= now - minutes * 60_000)
      .length;
  const m15 = since(15);
  const h1 = since(60);
  const h6 = since(360);
  const h24 = since(1_440);
  const d7 = rows.length;
  const uniqueAuthors = new Set(
    rows.map((row) => row.author_reliability_id).filter(Boolean),
  ).size;
  const uniqueCommunities = new Set(
    rows.map((row) => row.external_community_id),
  ).size;
  const actionable = rows.filter((row) =>
    /RESTOCK|DEAL|PRICE_DROP|SOLD_OUT|LOCAL_STOCK|SUPPLY|OFFICIAL/.test(
      String(row.signal_type),
    ),
  ).length;
  const textCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const linkHosts = new Set<string>();
  const signalCounts: Record<string, number> = {};
  let reliabilityTotal = 0;
  let reliabilityCount = 0;
  for (const row of rows) {
    const textHash = String(row.text_hash);
    textCounts.set(textHash, (textCounts.get(textHash) ?? 0) + 1);
    const sourceKey = `${stringValue(row.platform)}|${stringValue(row.external_community_id)}`;
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    const type = String(row.signal_type);
    signalCounts[type] = (signalCounts[type] ?? 0) + 1;
    for (const url of parseJson<Array<{ hostname?: string }>>(
      row.urls_json,
      [],
    )) {
      if (url.hostname) linkHosts.add(url.hostname);
    }
    if (row.reliability_score_bps !== null) {
      reliabilityTotal += Number(row.reliability_score_bps) / 100;
      reliabilityCount += 1;
    }
  }
  const duplicateMentions = [...textCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const dominantSource = Math.max(...sourceCounts.values()) / rows.length;
  const acceleration = mentionAcceleration(h24, d7);
  const sourceReliability = reliabilityCount
    ? reliabilityTotal / reliabilityCount
    : 60;
  const momentumScore = communityMomentumScore({
    mentionVelocity: Math.min(100, Math.max(0, acceleration / 3)),
    uniqueAuthors,
    uniqueCommunities,
    sourceReliability,
    actionableRatio: actionable / rows.length,
    sentimentShift: 50,
    linkDiversity: Math.min(100, linkHosts.size * 15),
    repeatedTextRatio: duplicateMentions / rows.length,
    singleSourceRatio: dominantSource,
    lowHistoryAuthorRatio: 0.5,
  });
  const hypeRisk = hypeRiskScore({
    mentionAcceleration: Math.min(100, Math.max(0, acceleration / 3)),
    lowHistoryAuthorRatio: 0.5,
    repeatedTextRatio: duplicateMentions / rows.length,
    repeatedLinkRatio: 0,
    dominantSourceRatio: dominantSource,
    crossPostRatio: duplicateMentions / rows.length,
    marketplaceSalesMomentum: null,
    sellerCountMomentum: null,
    priceMomentum: null,
  });
  const divergenceScore = signalDivergenceScore({
    communityMomentum: momentumScore,
    priceMomentum: null,
    sellerCountMomentum: null,
    stockBreadthMomentum: null,
    independentCommunities: uniqueCommunities,
  });
  const classification = classifyEarlySignal({
    communityMomentum: momentumScore,
    priceMomentum: null,
    sellerCountMomentum: null,
    stockBreadthMomentum: null,
    hypeRisk,
    verified: false,
  });
  const id = `community-momentum:${canonicalProductId}:${now}`;
  await db
    .prepare(
      `INSERT INTO community_product_momentum
        (id, canonical_product_id, calculated_at, mentions_15m, mentions_1h,
         mentions_6h, mentions_24h, mentions_7d, unique_authors,
         unique_communities, momentum_score, divergence_score,
         hype_risk_score, classification, metrics_json, data_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'production')`,
    )
    .bind(
      id,
      canonicalProductId,
      now,
      m15,
      h1,
      h6,
      h24,
      d7,
      uniqueAuthors,
      uniqueCommunities,
      momentumScore,
      divergenceScore,
      hypeRisk,
      classification,
      JSON.stringify({
        momentumChange: acceleration,
        redditChange: 0,
        discordChange: 0,
        sourceReliability,
        signalCounts,
        sourceDistribution: [...sourceCounts.entries()].map(
          ([sourceKey, mentions]) => ({
            source: sourceKey.split('|', 2)[1] ?? 'Community source',
            platform: (sourceKey.split('|', 2)[0] || 'reddit') as
              | 'reddit'
              | 'discord',
            mentions,
          }),
        ),
        conclusion:
          classification === 'INSUFFICIENT_DATA'
            ? 'Community momentum is measurable; market evidence is still required.'
            : 'Community activity warrants targeted market verification.',
        verificationStatus: 'unverified',
        firstDetectedAt: new Date(
          Math.min(...rows.map((row) => Number(row.occurred_at))),
        ).toISOString(),
      }),
    )
    .run();
  const redditMentions = rows.filter((row) => row.platform === 'reddit').length;
  const discordMentions = rows.filter(
    (row) => row.platform === 'discord',
  ).length;
  const restockMentions = Number(signalCounts.RESTOCK_REPORT ?? 0);
  const officialCatalyst =
    Number(signalCounts.OFFICIAL_NEWS_REFERENCE ?? 0) +
      Number(signalCounts.REPRINT_CONFIRMED_REFERENCE ?? 0) >
    0;
  const alertKind = officialCatalyst
    ? 'COMMUNITY_OFFICIAL_REFERENCE'
    : classification === 'EARLY_SIGNAL'
      ? 'COMMUNITY_EARLY_SIGNAL'
      : classification === 'HYPE_WITHOUT_MARKET_SUPPORT'
        ? 'COMMUNITY_HYPE_WARNING'
        : classification === 'SUPPLY_EXPANSION' ||
            classification === 'SUPPLY_CONTRACTION'
          ? 'COMMUNITY_SUPPLY_WARNING'
          : restockMentions >= 2
            ? 'COMMUNITY_RESTOCK_CLUSTER'
            : Number(signalCounts.REPRINT_RUMOR ?? 0) > 0
              ? 'COMMUNITY_REPRINT_RUMOR'
              : null;
  if (alertKind) {
    const rules = await db
      .prepare(
        `SELECT * FROM community_watch_rules
         WHERE canonical_product_id = ? AND active = 1`,
      )
      .bind(canonicalProductId)
      .all<Record<string, unknown>>();
    const alertsToInsert = rules.results.flatMap((rule) => {
      const passes =
        momentumScore >= Number(rule.minimum_momentum ?? 0) &&
        discordMentions >= Number(rule.minimum_discord_mentions ?? 0) &&
        redditMentions >= Number(rule.minimum_reddit_mentions ?? 0) &&
        divergenceScore >= Number(rule.minimum_divergence ?? 0) &&
        hypeRisk <= Number(rule.maximum_hype_risk ?? 100) &&
        restockMentions >= Number(rule.minimum_restock_mentions ?? 0) &&
        uniqueCommunities >=
          Number(rule.minimum_independent_confirmations ?? 0) &&
        (!rule.official_catalyst_required || officialCatalyst);
      if (!passes) return [];
      const userId = stringValue(rule.user_id);
      const dedupeWindow = Math.floor(now / (15 * 60_000));
      return [
        db
          .prepare(
            `INSERT INTO alerts
              (id, user_id, product_id, priority, kind, dedupe_key,
               payload_json, created_at)
             VALUES (?, ?, ?, 'normal', ?, ?, ?, ?)
             ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
          )
          .bind(
            crypto.randomUUID(),
            userId,
            canonicalProductId,
            alertKind,
            `${alertKind}:${canonicalProductId}:${dedupeWindow}`,
            JSON.stringify({
              communityMomentum: momentumScore,
              divergenceScore,
              hypeRisk,
              redditMentions,
              discordMentions,
              independentConfirmations: uniqueCommunities,
              officialCatalyst,
              buyRecommendation: false,
              message:
                'Community activity changed investigation priority; market evidence and economics are still required.',
            }),
            now,
          ),
      ];
    });
    if (alertsToInsert.length) await db.batch(alertsToInsert);
  }
  return { id, momentumScore, divergenceScore, hypeRisk, classification };
}

export async function persistCommunityVerification(
  db: D1Database,
  signal: NormalisedCommunitySignal,
  verification: CommunityVerificationResult,
) {
  const eventResult = await db
    .prepare(
      `SELECT community_event_signals.event_id,
              community_signals.source_id,
              community_signals.author_reliability_id
       FROM community_event_signals
       INNER JOIN community_signals
         ON community_signals.id = community_event_signals.signal_id
       WHERE community_event_signals.signal_id = ? LIMIT 1`,
    )
    .bind(signal.id)
    .first<{
      event_id: string;
      source_id: string;
      author_reliability_id: string | null;
    }>();
  if (!eventResult?.event_id) return null;
  const now = Date.now();
  const verificationId = crypto.randomUUID();
  const marketVerifiedAt = Date.parse(verification.marketVerifiedAt);
  const communityDetectedAt = Date.parse(signal.occurredAt);
  await db.batch([
    db
      .prepare(
        `INSERT INTO community_verifications
          (id, event_id, status, market_source, market_listing_id, market_url,
           community_detected_at, market_verified_at,
           price_at_community_detection_cents, price_at_verification_cents,
           delivered_price_cents, conservative_exit_cents,
           predicted_profit_cents, roi_bps, confidence_grade, details_json,
           data_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'production', ?)`,
      )
      .bind(
        verificationId,
        eventResult.event_id,
        verification.status,
        verification.marketSource,
        verification.marketListingId ?? null,
        verification.marketUrl ?? null,
        communityDetectedAt,
        marketVerifiedAt,
        signal.price === null ? null : Math.round(signal.price * 100),
        verification.itemPrice === null
          ? null
          : Math.round(verification.itemPrice * 100),
        verification.deliveredPrice === null ||
          verification.deliveredPrice === undefined
          ? null
          : Math.round(verification.deliveredPrice * 100),
        verification.conservativeExit === null ||
          verification.conservativeExit === undefined
          ? null
          : Math.round(verification.conservativeExit * 100),
        verification.predictedProfit === null ||
          verification.predictedProfit === undefined
          ? null
          : Math.round(verification.predictedProfit * 100),
        verification.roi === null || verification.roi === undefined
          ? null
          : Math.round(verification.roi * 10_000),
        verification.confidenceGrade ?? null,
        JSON.stringify({ detail: verification.detail }),
        now,
      ),
    db
      .prepare(
        `UPDATE community_signal_events
         SET verification_status = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(verification.status, now, eventResult.event_id),
    db
      .prepare(
        `UPDATE community_signals
         SET verification_status = ? WHERE id = ?`,
      )
      .bind(verification.status, signal.id),
  ]);
  if (
    signal.canonicalProductId &&
    verification.status === 'confirmed' &&
    canCommunityCreateBuyRecommendation({
      hasVerifiedMarketEvidence: true,
      conservativeProfit: verification.predictedProfit ?? null,
      roi: verification.roi ?? null,
    })
  ) {
    const rules = await db
      .prepare(
        `SELECT user_id FROM community_watch_rules
         WHERE canonical_product_id = ? AND active = 1`,
      )
      .bind(signal.canonicalProductId)
      .all<{ user_id: string }>();
    const alertStatements = rules.results.map((rule) =>
      db
        .prepare(
          `INSERT INTO alerts
            (id, user_id, product_id, priority, kind, dedupe_key,
             payload_json, created_at)
           VALUES (?, ?, ?, 'high', 'COMMUNITY_CONFIRMED_DEAL', ?, ?, ?)
           ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          rule.user_id,
          signal.canonicalProductId,
          `COMMUNITY_CONFIRMED_DEAL:${eventResult.event_id}`,
          JSON.stringify({
            eventId: eventResult.event_id,
            marketSource: verification.marketSource,
            itemPrice: verification.itemPrice,
            deliveredPrice: verification.deliveredPrice ?? null,
            conservativeExit: verification.conservativeExit ?? null,
            estimatedNetProfit: verification.predictedProfit ?? null,
            roi: verification.roi ?? null,
            confidence: verification.confidenceGrade ?? null,
            communityDetectedAt: signal.occurredAt,
            marketVerifiedAt: verification.marketVerifiedAt,
            communityOnlyBuyBlocked: true,
          }),
          now,
        ),
    );
    if (alertStatements.length) await db.batch(alertStatements);
  }
  return { verificationId, eventId: eventResult.event_id };
}

export async function saveRedditCursor(
  db: D1Database,
  sourceId: string,
  cursor: unknown,
) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO community_source_configs
        (id, source_id, user_id, scan_interval_minutes, cursor_json,
         config_json, raw_retention_hours, created_at, updated_at)
       VALUES (?, ?, NULL, 15, ?, '{}', 24, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cursor_json = excluded.cursor_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      `community-config:${sourceId}`,
      sourceId,
      JSON.stringify(cursor),
      now,
      now,
    )
    .run();
}

export async function saveCommunitySource(
  db: D1Database,
  user: RequestUser,
  input: {
    platform: 'reddit' | 'discord';
    name: string;
    externalCommunityId: string;
    externalChannelId?: string | null;
    enabled: boolean;
    games: string[];
    categories: string[];
  },
) {
  await ensureUser(db, user);
  const now = Date.now();
  const id = `community-source:${input.platform}:${stableId(`${input.externalCommunityId}:${input.externalChannelId ?? ''}`)}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO community_sources
          (id, platform, name, external_community_id, external_channel_id,
           enabled, games_json, categories_json, status, data_mode,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'production', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           enabled = excluded.enabled,
           games_json = excluded.games_json,
           categories_json = excluded.categories_json,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        input.platform,
        input.name.slice(0, 200),
        input.externalCommunityId.slice(0, 200),
        input.externalChannelId?.slice(0, 200) ?? null,
        input.enabled ? 1 : 0,
        JSON.stringify(input.games.slice(0, 10)),
        JSON.stringify(input.categories.slice(0, 20)),
        input.enabled ? 'credentials_required' : 'disabled',
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
          (id, user_id, action, target_type, target_id, metadata_json, created_at)
         VALUES (?, ?, 'community_source_saved', 'community_source', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({ platform: input.platform, enabled: input.enabled }),
        now,
      ),
  ]);
  return { id };
}

export async function saveCommunityWatchRule(
  db: D1Database,
  user: RequestUser,
  product: CommunityProductRadar,
  thresholds: {
    minimumMomentum: number;
    minimumDiscordMentions: number;
    minimumRedditMentions: number;
    minimumDivergence: number;
    maximumHypeRisk: number;
    minimumRestockMentions: number;
    minimumIndependentConfirmations: number;
    officialCatalystRequired: boolean;
  } = {
    minimumMomentum: 80,
    minimumDiscordMentions: 0,
    minimumRedditMentions: 0,
    minimumDivergence: 70,
    maximumHypeRisk: 50,
    minimumRestockMentions: 0,
    minimumIndependentConfirmations: 2,
    officialCatalystRequired: false,
  },
) {
  await ensureUser(db, user);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO products
          (id, game, set_name, name, slug, product_type, language,
           manually_verified, created_at, updated_at)
         VALUES (?, ?, 'Community Radar', ?, ?, 'community product', 'Unknown',
                 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(
        product.canonicalProductId,
        product.game,
        product.product,
        `community-${stableId(product.canonicalProductId)}`,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO community_watch_rules
          (id, user_id, canonical_product_id, minimum_momentum,
           minimum_discord_mentions, minimum_reddit_mentions,
           minimum_divergence, maximum_hype_risk,
           minimum_restock_mentions, minimum_independent_confirmations,
           official_catalyst_required, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(user_id, canonical_product_id) DO UPDATE SET
           minimum_momentum = excluded.minimum_momentum,
           minimum_discord_mentions = excluded.minimum_discord_mentions,
           minimum_reddit_mentions = excluded.minimum_reddit_mentions,
           minimum_divergence = excluded.minimum_divergence,
           maximum_hype_risk = excluded.maximum_hype_risk,
           minimum_restock_mentions = excluded.minimum_restock_mentions,
           minimum_independent_confirmations = excluded.minimum_independent_confirmations,
           official_catalyst_required = excluded.official_catalyst_required,
           active = 1, updated_at = excluded.updated_at`,
      )
      .bind(
        `community-watch:${user.id}:${stableId(product.canonicalProductId)}`,
        user.id,
        product.canonicalProductId,
        thresholds.minimumMomentum,
        thresholds.minimumDiscordMentions,
        thresholds.minimumRedditMentions,
        thresholds.minimumDivergence,
        thresholds.maximumHypeRisk,
        thresholds.minimumRestockMentions,
        thresholds.minimumIndependentConfirmations,
        thresholds.officialCatalystRequired ? 1 : 0,
        now,
        now,
      ),
  ]);
  return { watched: true };
}

export async function ignoreCommunityEvent(
  db: D1Database,
  user: RequestUser,
  eventId: string,
) {
  await ensureUser(db, user);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE community_signal_events
         SET verification_status = 'ignored', updated_at = ?
         WHERE id = ? AND data_mode = 'production'`,
      )
      .bind(now, eventId),
    db
      .prepare(
        `INSERT INTO audit_logs
          (id, user_id, action, target_type, target_id, metadata_json, created_at)
         VALUES (?, ?, 'community_event_ignored', 'community_event', ?, '{}', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, eventId, now),
  ]);
  return { ignored: true };
}

export async function createCommunityShadowTrade(
  db: D1Database,
  user: RequestUser,
  eventId: string,
) {
  const fixtureDashboard = communityFixtureDashboard();
  const communityProduct = fixtureDashboard.products.find(
    (product) => product.id === eventId,
  );
  if (!communityProduct || communityProduct.verificationStatus !== 'confirmed')
    throw new Error(
      'Only a market-confirmed community fixture can enter Shadow Mode.',
    );
  const amazonOpportunity = amazonFixtureDashboard().opportunities.find(
    (opportunity) =>
      opportunity.canonicalProductId === communityProduct.canonicalProductId,
  );
  if (!amazonOpportunity)
    throw new Error(
      'No matching market evidence is available for Shadow Mode.',
    );
  const itemPrice = communityProduct.marketEvidence.itemPrice;
  const deliveredPrice = communityProduct.marketEvidence.deliveredPrice;
  const conservativeExit = communityProduct.marketEvidence.conservativeExit;
  const shadowOpportunity = {
    ...amazonOpportunity,
    id: `community-shadow:${eventId}`,
    product: communityProduct.product,
    game: communityProduct.game,
    asin: 'B0RFTSPRT1',
    marketplace: 'DE' as const,
    sourceListingUrl:
      communityProduct.marketEvidence.sourceUrl ??
      amazonOpportunity.sourceListingUrl,
    sellerType: 'AMAZON_DIRECT' as const,
    sellerName: 'Amazon fixture verification',
    currentPrice: itemPrice,
    buyBoxPrice: itemPrice,
    amazonPrice: itemPrice,
    lowestNew: itemPrice,
    shipping:
      itemPrice !== null && deliveredPrice !== null
        ? Math.max(0, deliveredPrice - itemPrice)
        : null,
    shippingStatus: 'ESTIMATED' as const,
    mandatoryFees:
      itemPrice !== null &&
      deliveredPrice !== null &&
      conservativeExit !== null &&
      communityProduct.marketEvidence.estimatedNetProfit !== null
        ? Math.max(
            0,
            conservativeExit -
              deliveredPrice -
              communityProduct.marketEvidence.estimatedNetProfit,
          )
        : 0,
    deliveredPrice,
    economics: {
      ...amazonOpportunity.economics,
      conservativeExit,
      conservativeProfit: communityProduct.marketEvidence.estimatedNetProfit,
      roi: communityProduct.marketEvidence.roi,
    },
    riskFlags: [],
    reviewRequired: false,
    qualified: true,
    dataMode: 'fixture' as const,
  };
  const trade = await createAmazonShadowTrade(db, user, shadowOpportunity);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO products
          (id, game, set_name, name, slug, product_type, language,
           manually_verified, created_at, updated_at)
         VALUES (?, ?, 'Community Radar', ?, ?, 'community product', 'Unknown',
                 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(
        communityProduct.canonicalProductId,
        communityProduct.game,
        communityProduct.product,
        `community-${stableId(communityProduct.canonicalProductId)}`,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO community_signal_events
          (id, dedupe_key, canonical_product_id, signal_type, first_detected_at,
           last_detected_at, mention_count, unique_author_count,
           unique_community_count, platforms_json, source_ids_json,
           verification_status, data_mode, created_at, updated_at)
         VALUES (?, ?, ?, 'DEAL_REPORT', ?, ?, ?, ?, ?, '["discord","reddit"]',
                 '[]', 'confirmed', 'fixture', ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(
        eventId,
        `fixture:${eventId}`,
        communityProduct.canonicalProductId,
        Date.parse(communityProduct.firstDetectedAt),
        Date.parse(
          communityProduct.marketDetectedAt ?? communityProduct.firstDetectedAt,
        ),
        communityProduct.mentionCounts.h24,
        communityProduct.uniqueAuthors,
        communityProduct.uniqueCommunities,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO community_shadow_evaluations
          (id, shadow_trade_id, community_event_id, community_detected_at,
           market_verified_at, price_at_community_detection_cents,
           price_at_verification_cents, community_momentum, divergence_score,
           hype_risk_score, source_reliability, economics_json, data_mode,
           created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fixture', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        trade.id,
        eventId,
        Date.parse(communityProduct.firstDetectedAt),
        communityProduct.marketDetectedAt
          ? Date.parse(communityProduct.marketDetectedAt)
          : null,
        communityProduct.marketEvidence.itemPrice === null
          ? null
          : Math.round(communityProduct.marketEvidence.itemPrice * 100),
        communityProduct.marketEvidence.deliveredPrice === null
          ? null
          : Math.round(communityProduct.marketEvidence.deliveredPrice * 100),
        communityProduct.momentumScore,
        communityProduct.divergenceScore,
        communityProduct.hypeRisk,
        communityProduct.sourceReliability,
        JSON.stringify({
          ...communityProduct.marketEvidence,
          leadTimeMinutes: communityProduct.leadTimeMinutes,
          communityOnlyBuyBlocked: true,
        }),
        now,
      ),
  ]);
  return {
    ...trade,
    communityLeadTimeMinutes: communityProduct.leadTimeMinutes,
  };
}

export function getFixtureCommunityProduct(eventId: string) {
  return communityFixtureDashboard().products.find(
    (product) => product.id === eventId,
  );
}

export function getFixtureCommunitySignal(signalId: string) {
  return communityFixtureSignals().find((signal) => signal.id === signalId);
}

export const communityRepositoryInternals = { COMMUNITY_ALERT_TYPES };
