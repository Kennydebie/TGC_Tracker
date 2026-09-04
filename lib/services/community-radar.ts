import {
  COMMUNITY_SIGNAL_TYPES,
  type NormalisedCommunitySignal,
} from '../community.ts';
import {
  DiscordConnector,
  type DiscordMessagePayload,
} from '../connectors/discord.ts';
import {
  RedditConnector,
  RedditConnectorError,
  type RedditCursor,
} from '../connectors/reddit.ts';
import { KeepaConnector } from '../connectors/keepa.ts';
import { AMAZON_MARKETPLACES, extractAmazonAsin } from '../amazon.ts';
import {
  listEnabledRedditSources,
  persistCommunityScan,
  persistCommunityVerification,
  recalculateCommunityMomentum,
  saveRedditCursor,
  type CommunityVerificationResult,
} from '../repositories/community.ts';

const ACTIONABLE_SIGNAL_TYPES = new Set([
  'RESTOCK_REPORT',
  'DEAL_REPORT',
  'PRICE_DROP_REPORT',
  'SOLD_OUT_REPORT',
  'LOCAL_STOCK_REPORT',
  'PREORDER_REPORT',
  'SUPPLY_SHORTAGE_REPORT',
]);

function csv(value?: string): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function retentionHours(value?: string) {
  const parsed = Number(value ?? 24);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(168, parsed)) : 24;
}

export type CommunityEnvironment = {
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  REDDIT_COMMUNITIES?: string;
  COMMUNITY_AUTHOR_HASH_SALT?: string;
  COMMUNITY_RAW_RETENTION_HOURS?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_GUILD_ALLOWLIST?: string;
  DISCORD_CHANNEL_ALLOWLIST?: string;
  KEEPA_API_KEY?: string;
};

export async function runRedditCommunityScan(options: {
  db: D1Database;
  env: CommunityEnvironment;
  now?: () => number;
  fetchImpl?: typeof fetch;
}) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const configuredSources = await listEnabledRedditSources(options.db);
  const environmentCommunities = csv(options.env.REDDIT_COMMUNITIES);
  const communities = [
    ...new Set([
      ...configuredSources.map((source) => source.community),
      ...environmentCommunities,
    ]),
  ];
  const connector = new RedditConnector({
    clientId: options.env.REDDIT_CLIENT_ID,
    clientSecret: options.env.REDDIT_CLIENT_SECRET,
    userAgent: options.env.REDDIT_USER_AGENT,
    communities,
    authorSalt: options.env.COMMUNITY_AUTHOR_HASH_SALT ?? 'tcg-scout-community',
    rawRetentionHours: retentionHours(
      options.env.COMMUNITY_RAW_RETENTION_HOURS,
    ),
    fetchImpl: options.fetchImpl,
    now,
  });
  const runId = crypto.randomUUID();
  const validation = connector.validateConfig();
  if (!validation.valid) {
    await persistCommunityScan(options.db, {
      id: runId,
      platform: 'reddit',
      status: 'credentials_required',
      startedAt,
      finishedAt: now(),
      eventsReceived: 0,
      messagesFiltered: 0,
      signalsCreated: 0,
      duplicatesClustered: 0,
      productsMatched: 0,
      rateLimitRemaining: null,
      errorCode: 'credentials_required',
      errorDetail: validation.errors.join('; '),
      signals: [],
    });
    return { status: 'credentials_required', signalsCreated: 0 } as const;
  }
  if (!communities.length) {
    await persistCommunityScan(options.db, {
      id: runId,
      platform: 'reddit',
      status: 'no_sources_configured',
      startedAt,
      finishedAt: now(),
      eventsReceived: 0,
      messagesFiltered: 0,
      signalsCreated: 0,
      duplicatesClustered: 0,
      productsMatched: 0,
      rateLimitRemaining: null,
      errorCode: 'no_sources_configured',
      errorDetail: 'Configure at least one Reddit community source.',
      signals: [],
    });
    return { status: 'no_sources_configured', signalsCreated: 0 } as const;
  }
  const postCursors: Record<string, RedditCursor> = {};
  const commentCursors: Record<string, RedditCursor> = {};
  for (const source of configuredSources) {
    const stored = source.cursor as {
      posts?: RedditCursor;
      comments?: RedditCursor;
    };
    if (stored.posts) postCursors[source.community] = stored.posts;
    if (stored.comments) commentCursors[source.community] = stored.comments;
  }
  try {
    const posts = await connector.scanNewPosts(postCursors);
    const comments = await connector.scanNewComments(commentCursors);
    const records = [...posts.records, ...comments.records];
    const candidates = await Promise.all(
      records.map((record) => connector.normalise(record)),
    );
    const signals = candidates.filter(
      (signal): signal is NormalisedCommunitySignal =>
        Boolean(
          signal &&
          (signal.canonicalProductId ||
            signal.signalType !== 'GENERAL_SENTIMENT'),
        ),
    );
    const filtered = records.length - signals.length;
    const persisted = await persistCommunityScan(options.db, {
      id: runId,
      platform: 'reddit',
      status: 'success',
      startedAt,
      finishedAt: now(),
      eventsReceived: records.length,
      messagesFiltered: filtered,
      signalsCreated: signals.length,
      duplicatesClustered: 0,
      productsMatched: signals.filter((signal) => signal.canonicalProductId)
        .length,
      rateLimitRemaining:
        comments.rateLimitRemaining ?? posts.rateLimitRemaining,
      errorCode: null,
      errorDetail: null,
      signals,
    });
    for (const source of configuredSources) {
      await saveRedditCursor(options.db, source.id, {
        posts: posts.cursors[source.community] ?? null,
        comments: comments.cursors[source.community] ?? null,
      });
    }
    for (const productId of new Set(
      signals.flatMap((signal) =>
        signal.canonicalProductId ? [signal.canonicalProductId] : [],
      ),
    )) {
      await recalculateCommunityMomentum(options.db, productId, now());
    }
    for (const signal of signals.filter(shouldTriggerMarketVerification)) {
      const verification = await verifyCommunitySignal(
        signal,
        options.env,
        options.fetchImpl,
        now,
      );
      if (verification)
        await persistCommunityVerification(options.db, signal, verification);
    }
    return {
      status: 'success',
      signalsCreated: persisted.signalsCreated,
      duplicatesClustered: persisted.duplicatesClustered,
    } as const;
  } catch (error) {
    const classification =
      error instanceof RedditConnectorError
        ? error.classification
        : 'upstream_error';
    await persistCommunityScan(options.db, {
      id: runId,
      platform: 'reddit',
      status: 'error',
      startedAt,
      finishedAt: now(),
      eventsReceived: 0,
      messagesFiltered: 0,
      signalsCreated: 0,
      duplicatesClustered: 0,
      productsMatched: 0,
      rateLimitRemaining: null,
      errorCode: classification,
      errorDetail:
        error instanceof Error ? error.message : 'Reddit scan failed.',
      signals: [],
    });
    return { status: 'error', errorCode: classification } as const;
  }
}

export async function processDiscordCommunityMessage(options: {
  db: D1Database;
  env: CommunityEnvironment;
  message: DiscordMessagePayload;
  now?: () => number;
  fetchImpl?: typeof fetch;
}) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const connector = new DiscordConnector({
    botToken: options.env.DISCORD_BOT_TOKEN,
    applicationId: options.env.DISCORD_APPLICATION_ID,
    guildAllowlist: csv(options.env.DISCORD_GUILD_ALLOWLIST),
    channelAllowlist: csv(options.env.DISCORD_CHANNEL_ALLOWLIST),
    authorSalt: options.env.COMMUNITY_AUTHOR_HASH_SALT ?? 'tcg-scout-community',
    rawRetentionHours: retentionHours(
      options.env.COMMUNITY_RAW_RETENTION_HOURS,
    ),
    fetchImpl: options.fetchImpl,
    now,
  });
  const validation = connector.validateConfig();
  if (!validation.valid) {
    return { accepted: false, reason: 'bot_required' } as const;
  }
  const messageResult = connector.normaliseMessage(options.message);
  if (!messageResult.accepted) {
    await persistCommunityScan(options.db, {
      id: crypto.randomUUID(),
      platform: 'discord',
      status:
        messageResult.reason === 'message_content_unavailable'
          ? 'permission_required'
          : 'filtered',
      startedAt,
      finishedAt: now(),
      eventsReceived: 1,
      messagesFiltered: 1,
      signalsCreated: 0,
      duplicatesClustered: 0,
      productsMatched: 0,
      rateLimitRemaining: null,
      errorCode:
        messageResult.reason === 'message_content_unavailable'
          ? 'message_content_unavailable'
          : null,
      errorDetail:
        messageResult.reason === 'message_content_unavailable'
          ? 'Discord MESSAGE_CONTENT intent is unavailable.'
          : null,
      signals: [],
    });
    return messageResult;
  }
  const signal = await connector.normalise(messageResult.record);
  if (!signal) return { accepted: false, reason: 'invalid_payload' } as const;
  const persisted = await persistCommunityScan(options.db, {
    id: crypto.randomUUID(),
    platform: 'discord',
    status: 'connected',
    startedAt,
    finishedAt: now(),
    eventsReceived: 1,
    messagesFiltered: 0,
    signalsCreated: 1,
    duplicatesClustered: 0,
    productsMatched: signal.canonicalProductId ? 1 : 0,
    rateLimitRemaining: null,
    errorCode: null,
    errorDetail: null,
    signals: [signal],
  });
  if (signal.canonicalProductId)
    await recalculateCommunityMomentum(
      options.db,
      signal.canonicalProductId,
      now(),
    );
  if (shouldTriggerMarketVerification(signal)) {
    const verification = await verifyCommunitySignal(
      signal,
      options.env,
      options.fetchImpl,
      now,
    );
    if (verification)
      await persistCommunityVerification(options.db, signal, verification);
  }
  return {
    accepted: true,
    signalId: signal.id,
    duplicatesClustered: persisted.duplicatesClustered,
  } as const;
}

export function shouldTriggerMarketVerification(
  signal: NormalisedCommunitySignal,
) {
  return Boolean(
    signal.canonicalProductId &&
    signal.confidence >= 80 &&
    ACTIONABLE_SIGNAL_TYPES.has(signal.signalType) &&
    signal.urls.some(
      (url) => url.fetchAllowed && url.evidenceRole === 'marketplace',
    ),
  );
}

export async function verifyCommunitySignal(
  signal: NormalisedCommunitySignal,
  env: CommunityEnvironment,
  fetchImpl?: typeof fetch,
  now: () => number = Date.now,
): Promise<CommunityVerificationResult | null> {
  const amazonUrl = signal.urls.find((url) => url.hostname.includes('amazon.'));
  if (!amazonUrl || !amazonUrl.fetchAllowed) return null;
  const identity = extractAmazonAsin(amazonUrl.url);
  if (!identity || !env.KEEPA_API_KEY?.trim()) return null;
  if (AMAZON_MARKETPLACES[identity.marketplace].keepaDomainId === null)
    return null;
  const connector = new KeepaConnector({
    apiKey: env.KEEPA_API_KEY,
    defaultMarketplace: identity.marketplace,
    fetchImpl,
    now,
  });
  const [product] = await connector.lookupProducts(
    [identity.asin],
    identity.marketplace,
    'critical_watched',
  );
  const verifiedAt = new Date(now()).toISOString();
  if (!product) {
    return {
      status: 'out_of_stock',
      marketSource: 'Keepa / Amazon Scout',
      marketListingId: identity.asin,
      marketUrl: amazonUrl.url,
      marketVerifiedAt: verifiedAt,
      itemPrice: null,
      detail: 'Keepa returned no active product observation.',
    };
  }
  const observation = connector.normaliseProduct(product, identity.marketplace);
  const observed = observation.currentPrice;
  if (observed === null) {
    return {
      status: 'out_of_stock',
      marketSource: 'Keepa / Amazon Scout',
      marketListingId: identity.asin,
      marketUrl: amazonUrl.url,
      marketVerifiedAt: verifiedAt,
      itemPrice: null,
      detail:
        'The product exists, but no current supported offer price was observed.',
    };
  }
  const difference =
    signal.price === null
      ? 0
      : Math.abs(observed - signal.price) / signal.price;
  return {
    status: difference <= 0.05 ? 'confirmed' : 'price_changed',
    marketSource: 'Keepa / Amazon Scout',
    marketListingId: identity.asin,
    marketUrl: amazonUrl.url,
    marketVerifiedAt: verifiedAt,
    itemPrice: observed,
    detail:
      signal.price === null
        ? 'Amazon availability was verified; no community price was claimed.'
        : difference <= 0.05
          ? 'The observed Amazon price is within 5% of the community claim.'
          : 'The current Amazon price no longer matches the community claim.',
  };
}

export const communityServiceInternals = {
  ACTIONABLE_SIGNAL_TYPES,
  csv,
  retentionHours,
  supportedSignalTypes: COMMUNITY_SIGNAL_TYPES,
};
