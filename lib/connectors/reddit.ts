import {
  normaliseCommunitySignal,
  type CommunitySourceInput,
  type NormalisedCommunitySignal,
} from '../community.ts';

const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_ORIGIN = 'https://oauth.reddit.com';
const MAX_PAGE_SIZE = 100;
const MAX_PAGES_PER_COMMUNITY = 5;

export type RedditConfig = {
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
  communities?: string[];
  authorSalt?: string;
  rawRetentionHours?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type RedditCursor = {
  after: string | null;
  newestCreatedUtc: number | null;
};

type RedditListingChild = {
  kind?: string;
  data?: {
    id?: string;
    name?: string;
    subreddit?: string;
    author?: string;
    created_utc?: number;
    title?: string;
    selftext?: string;
    body?: string;
    score?: number;
    num_comments?: number;
    permalink?: string;
    removed_by_category?: string | null;
  };
};

type RedditListing = {
  data?: {
    after?: string | null;
    children?: RedditListingChild[];
  };
};

export type RedditScanResult = {
  records: CommunitySourceInput[];
  cursors: Record<string, RedditCursor>;
  requests: number;
  rateLimitRemaining: number | null;
  rateLimitResetSeconds: number | null;
};

export class RedditConnectorError extends Error {
  readonly classification:
    | 'credentials_required'
    | 'authentication_failed'
    | 'rate_limited'
    | 'private_community'
    | 'upstream_error';
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    classification:
      | 'credentials_required'
      | 'authentication_failed'
      | 'rate_limited'
      | 'private_community'
      | 'upstream_error',
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RedditConnectorError';
    this.classification = classification;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function safeCommunity(value: string): string | null {
  const trimmed = value.trim().replace(/^r\//i, '');
  return /^[A-Za-z0-9_]{2,50}$/.test(trimmed) ? trimmed : null;
}

function validUserAgent(value: string | undefined) {
  return Boolean(
    value && value.trim().length >= 10 && value.trim().length <= 256,
  );
}

function parseRateHeader(response: Response, name: string): number | null {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) ? value : null;
}

export class RedditConnector {
  readonly id = 'community-reddit';
  readonly name = 'Reddit Community Radar';
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private rateLimitRemaining: number | null = null;
  private rateLimitResetSeconds: number | null = null;
  private readonly config: RedditConfig;

  constructor(config: RedditConfig = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  validateConfig() {
    const errors: string[] = [];
    if (!this.config.clientId?.trim())
      errors.push('REDDIT_CLIENT_ID is required');
    if (!this.config.clientSecret?.trim())
      errors.push('REDDIT_CLIENT_SECRET is required');
    if (!validUserAgent(this.config.userAgent))
      errors.push('REDDIT_USER_AGENT must identify the application');
    const invalidCommunities = (this.config.communities ?? []).filter(
      (item) => !safeCommunity(item),
    );
    if (invalidCommunities.length)
      errors.push('One or more Reddit community names are invalid');
    return { valid: errors.length === 0, errors };
  }

  getPolicy() {
    return {
      access: 'official_oauth_api',
      htmlScrapingFallback: false,
      incremental: true,
      rawRetentionHours: Math.max(
        1,
        Math.min(168, this.config.rawRetentionHours ?? 24),
      ),
      storesPrivateMessages: false,
      storesAuthorIdentity: false,
      maxPagesPerCommunity: MAX_PAGES_PER_COMMUNITY,
    } as const;
  }

  async healthCheck() {
    const validation = this.validateConfig();
    if (!validation.valid) {
      return {
        ok: false,
        status: 'credentials_required',
        checkedAt: new Date(this.now()).toISOString(),
        detail: validation.errors.join('; '),
      };
    }
    try {
      await this.getToken();
      return {
        ok: true,
        status: 'connected',
        checkedAt: new Date(this.now()).toISOString(),
        detail: 'OAuth token accepted. No Reddit HTML scraping is used.',
      };
    } catch (error) {
      return {
        ok: false,
        status:
          error instanceof RedditConnectorError
            ? error.classification
            : 'upstream_error',
        checkedAt: new Date(this.now()).toISOString(),
        detail:
          error instanceof Error ? error.message : 'Reddit health check failed',
      };
    }
  }

  async scanNewPosts(
    cursors: Record<string, RedditCursor> = {},
  ): Promise<RedditScanResult> {
    return this.scanListing('new', cursors, 'post');
  }

  async scanNewComments(
    cursors: Record<string, RedditCursor> = {},
  ): Promise<RedditScanResult> {
    return this.scanListing('comments', cursors, 'comment');
  }

  async normalise(
    record: CommunitySourceInput,
  ): Promise<NormalisedCommunitySignal | null> {
    return normaliseCommunitySignal(record, {
      authorSalt: this.config.authorSalt ?? 'tcg-scout-community',
      rawRetentionHours: this.config.rawRetentionHours,
      now: this.now(),
    });
  }

  private async scanListing(
    endpoint: 'new' | 'comments',
    cursors: Record<string, RedditCursor>,
    kind: 'post' | 'comment',
  ): Promise<RedditScanResult> {
    const validation = this.validateConfig();
    if (!validation.valid) {
      throw new RedditConnectorError(
        validation.errors.join('; '),
        'credentials_required',
      );
    }
    const records: CommunitySourceInput[] = [];
    const nextCursors: Record<string, RedditCursor> = {};
    let requests = 0;
    for (const configured of this.config.communities ?? []) {
      const community = safeCommunity(configured);
      if (!community) continue;
      const previous = cursors[community] ?? {
        after: null,
        newestCreatedUtc: null,
      };
      let after: string | null = previous.after;
      let newestCreatedUtc = previous.newestCreatedUtc;
      for (let page = 0; page < MAX_PAGES_PER_COMMUNITY; page += 1) {
        const params = new URLSearchParams({
          limit: String(MAX_PAGE_SIZE),
          raw_json: '1',
        });
        if (after) params.set('after', after);
        const response = await this.apiRequest(
          `/r/${community}/${endpoint}?${params.toString()}`,
        );
        requests += 1;
        const listing = (await response.json()) as RedditListing;
        const children = listing.data?.children ?? [];
        let reachedKnownContent = false;
        for (const child of children) {
          const data = child.data;
          if (!data?.id || !data.created_utc) continue;
          if (
            previous.newestCreatedUtc &&
            data.created_utc <= previous.newestCreatedUtc
          ) {
            reachedKnownContent = true;
            continue;
          }
          const content =
            kind === 'post'
              ? `${data.title ?? ''}\n${data.selftext ?? ''}`
              : (data.body ?? '');
          if (
            !content.trim() ||
            content === '[deleted]' ||
            content === '[removed]' ||
            data.removed_by_category
          )
            continue;
          records.push({
            platform: 'reddit',
            community: data.subreddit ?? community,
            externalId: `${kind === 'post' ? 't3' : 't1'}_${data.id}`,
            authorExternalId:
              data.author &&
              !['[deleted]', 'AutoModerator'].includes(data.author)
                ? data.author
                : null,
            occurredAt: new Date(data.created_utc * 1000).toISOString(),
            text: content,
            score: data.score ?? null,
            commentCount: data.num_comments ?? null,
            permalink: data.permalink
              ? `https://www.reddit.com${data.permalink}`
              : null,
          });
          newestCreatedUtc = Math.max(newestCreatedUtc ?? 0, data.created_utc);
        }
        after = listing.data?.after ?? null;
        if (!after || reachedKnownContent || children.length === 0) break;
      }
      nextCursors[community] = { after, newestCreatedUtc };
    }
    return {
      records: [
        ...new Map(
          records.map((record) => [record.externalId, record]),
        ).values(),
      ],
      cursors: nextCursors,
      requests,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitResetSeconds: this.rateLimitResetSeconds,
    };
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 60_000)
      return this.accessToken.value;
    const validation = this.validateConfig();
    if (!validation.valid)
      throw new RedditConnectorError(
        validation.errors.join('; '),
        'credentials_required',
      );
    const credentials = `${this.config.clientId}:${this.config.clientSecret}`;
    const response = await this.fetchImpl(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(credentials)}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': this.config.userAgent!.trim(),
      },
      body: 'grant_type=client_credentials',
      redirect: 'error',
    });
    if (!response.ok) {
      throw new RedditConnectorError(
        response.status === 401
          ? 'Reddit OAuth credentials were rejected.'
          : `Reddit OAuth failed with HTTP ${response.status}.`,
        response.status === 401
          ? 'authentication_failed'
          : response.status === 429
            ? 'rate_limited'
            : 'upstream_error',
        response.status,
      );
    }
    const payload = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    if (
      !payload.access_token ||
      payload.token_type?.toLowerCase() !== 'bearer'
    ) {
      throw new RedditConnectorError(
        'Reddit OAuth returned no bearer token.',
        'authentication_failed',
      );
    }
    this.accessToken = {
      value: payload.access_token,
      expiresAt: this.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
    };
    return payload.access_token;
  }

  private async apiRequest(path: string): Promise<Response> {
    const token = await this.getToken();
    const url = new URL(path, REDDIT_API_ORIGIN);
    if (url.origin !== REDDIT_API_ORIGIN)
      throw new RedditConnectorError(
        'Unsafe Reddit API path.',
        'upstream_error',
      );
    const response = await this.fetchImpl(url, {
      headers: {
        authorization: `Bearer ${token}`,
        'user-agent': this.config.userAgent!.trim(),
      },
      redirect: 'error',
    });
    this.rateLimitRemaining = parseRateHeader(
      response,
      'x-ratelimit-remaining',
    );
    this.rateLimitResetSeconds = parseRateHeader(response, 'x-ratelimit-reset');
    if (response.ok) return response;
    if (response.status === 401) {
      this.accessToken = null;
      throw new RedditConnectorError(
        'Reddit OAuth token was rejected.',
        'authentication_failed',
        401,
      );
    }
    if (response.status === 403 || response.status === 404) {
      throw new RedditConnectorError(
        'Reddit community is private, unavailable or not permitted.',
        'private_community',
        response.status,
      );
    }
    if (response.status === 429) {
      const retrySeconds = Number(
        response.headers.get('retry-after') ?? this.rateLimitResetSeconds ?? 60,
      );
      throw new RedditConnectorError(
        'Reddit API rate limit reached.',
        'rate_limited',
        429,
        Math.max(1, retrySeconds) * 1000,
      );
    }
    throw new RedditConnectorError(
      `Reddit API failed with HTTP ${response.status}.`,
      'upstream_error',
      response.status,
    );
  }
}

export const redditInternals = { safeCommunity };
