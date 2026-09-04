import {
  normaliseCommunitySignal,
  type CommunitySourceInput,
  type NormalisedCommunitySignal,
} from '../community.ts';

const DISCORD_API_ORIGIN = 'https://discord.com';
const DISCORD_API_VERSION = 10;
const GUILDS_INTENT = 1 << 0;
const GUILD_MESSAGES_INTENT = 1 << 9;
const MESSAGE_CONTENT_INTENT = 1 << 15;

export type DiscordConfig = {
  botToken?: string;
  applicationId?: string;
  guildAllowlist?: string[];
  channelAllowlist?: string[];
  authorSalt?: string;
  rawRetentionHours?: number;
  fetchImpl?: typeof fetch;
  webSocketFactory?: (url: string) => WebSocket;
  now?: () => number;
};

export type DiscordMessagePayload = {
  id?: string;
  guild_id?: string;
  channel_id?: string;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  author?: { id?: string; bot?: boolean; username?: string };
  member?: { nick?: string | null };
  attachments?: Array<{ url?: string }>;
  embeds?: Array<{ url?: string; title?: string; description?: string }>;
};

export type DiscordMessageResult =
  | { accepted: true; record: CommunitySourceInput }
  | {
      accepted: false;
      reason:
        | 'direct_message_ignored'
        | 'guild_not_allowed'
        | 'channel_not_allowed'
        | 'bot_message_ignored'
        | 'message_content_unavailable'
        | 'irrelevant'
        | 'invalid_payload';
    };

export class DiscordConnectorError extends Error {
  readonly classification:
    | 'bot_required'
    | 'authentication_failed'
    | 'permission_required'
    | 'rate_limited'
    | 'disconnected'
    | 'upstream_error';
  readonly status?: number;

  constructor(
    message: string,
    classification:
      | 'bot_required'
      | 'authentication_failed'
      | 'permission_required'
      | 'rate_limited'
      | 'disconnected'
      | 'upstream_error',
    status?: number,
  ) {
    super(message);
    this.name = 'DiscordConnectorError';
    this.classification = classification;
    this.status = status;
  }
}

function safeSnowflake(value: string): boolean {
  return /^\d{5,30}$/.test(value);
}

function parseAllowlist(values: string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((item) => item.trim()).filter(safeSnowflake)),
  ];
}

export function isLikelyTcgRelevant(value: string): boolean {
  const text = value.toLowerCase();
  const product =
    /pokemon|pokémon|riftbound|spiritforged|prismatic|destined rivals|booster|\betb\b|tcg|cardmarket/;
  const actionable =
    /restock|stock|available|sold out|\boos\b|deal|discount|price|€|£|\$|reprint|release|tournament|ban|scam|shortage|allocation|store|amazon|ebay|marktplaats/;
  return product.test(text) && actionable.test(text);
}

export class DiscordConnector {
  readonly id = 'community-discord';
  readonly name = 'Discord Community Radar';
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  readonly guildAllowlist: string[];
  readonly channelAllowlist: string[];
  readonly config: DiscordConfig;

  constructor(config: DiscordConfig = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
    this.guildAllowlist = parseAllowlist(config.guildAllowlist);
    this.channelAllowlist = parseAllowlist(config.channelAllowlist);
  }

  validateConfig() {
    const errors: string[] = [];
    const token = this.config.botToken?.trim();
    if (!token) errors.push('DISCORD_BOT_TOKEN is required');
    else if (token.startsWith('mfa.') || /\s/.test(token))
      errors.push(
        'DISCORD_BOT_TOKEN must be an official bot token, never a user token',
      );
    if (
      !this.config.applicationId?.trim() ||
      !safeSnowflake(this.config.applicationId.trim())
    )
      errors.push('DISCORD_APPLICATION_ID is required');
    if (!this.guildAllowlist.length)
      errors.push('DISCORD_GUILD_ALLOWLIST must contain at least one guild ID');
    if (!this.channelAllowlist.length)
      errors.push(
        'DISCORD_CHANNEL_ALLOWLIST must contain at least one channel ID',
      );
    return { valid: errors.length === 0, errors };
  }

  getPolicy() {
    return {
      access: 'official_bot_gateway',
      eventDriven: true,
      selfBot: false,
      userTokensAllowed: false,
      privateMessagesStored: false,
      explicitGuildAllowlist: true,
      explicitChannelAllowlist: true,
      rawRetentionHours: Math.max(
        1,
        Math.min(168, this.config.rawRetentionHours ?? 24),
      ),
      intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT'],
    } as const;
  }

  async healthCheck() {
    const validation = this.validateConfig();
    if (!validation.valid) {
      return {
        ok: false,
        status: 'bot_required',
        checkedAt: new Date(this.now()).toISOString(),
        detail: validation.errors.join('; '),
        messageContentAvailable: null,
      };
    }
    try {
      const response = await this.fetchImpl(
        `${DISCORD_API_ORIGIN}/api/v${DISCORD_API_VERSION}/users/@me`,
        {
          headers: { authorization: `Bot ${this.config.botToken!.trim()}` },
          redirect: 'error',
        },
      );
      if (!response.ok) {
        throw new DiscordConnectorError(
          response.status === 401
            ? 'Discord bot token was rejected.'
            : `Discord bot health check failed with HTTP ${response.status}.`,
          response.status === 401
            ? 'authentication_failed'
            : response.status === 429
              ? 'rate_limited'
              : 'upstream_error',
          response.status,
        );
      }
      const payload = (await response.json()) as { id?: string; bot?: boolean };
      if (!payload.id || payload.bot !== true) {
        throw new DiscordConnectorError(
          'Discord credential did not identify an official bot account.',
          'authentication_failed',
        );
      }
      return {
        ok: true,
        status: 'connected',
        checkedAt: new Date(this.now()).toISOString(),
        detail: `${this.guildAllowlist.length} guild(s) and ${this.channelAllowlist.length} channel(s) explicitly allowed.`,
        messageContentAvailable: null,
      };
    } catch (error) {
      return {
        ok: false,
        status:
          error instanceof DiscordConnectorError
            ? error.classification
            : 'upstream_error',
        checkedAt: new Date(this.now()).toISOString(),
        detail:
          error instanceof Error
            ? error.message
            : 'Discord health check failed',
        messageContentAvailable: null,
      };
    }
  }

  normaliseMessage(message: DiscordMessagePayload): DiscordMessageResult {
    if (!message.id || !message.channel_id || !message.timestamp)
      return { accepted: false, reason: 'invalid_payload' };
    if (!message.guild_id)
      return { accepted: false, reason: 'direct_message_ignored' };
    if (!this.guildAllowlist.includes(message.guild_id))
      return { accepted: false, reason: 'guild_not_allowed' };
    if (!this.channelAllowlist.includes(message.channel_id))
      return { accepted: false, reason: 'channel_not_allowed' };
    if (message.author?.bot)
      return { accepted: false, reason: 'bot_message_ignored' };
    const attachmentUrls = (message.attachments ?? []).flatMap((item) =>
      item.url ? [item.url] : [],
    );
    const embedText = (message.embeds ?? []).flatMap((item) =>
      [item.title, item.description, item.url].filter(
        (value): value is string => Boolean(value),
      ),
    );
    const content = [message.content ?? '', ...embedText, ...attachmentUrls]
      .join('\n')
      .trim();
    if (!content)
      return { accepted: false, reason: 'message_content_unavailable' };
    if (!isLikelyTcgRelevant(content))
      return { accepted: false, reason: 'irrelevant' };
    return {
      accepted: true,
      record: {
        platform: 'discord',
        community: message.guild_id,
        channel: message.channel_id,
        externalId: message.id,
        authorExternalId: message.author?.id ?? null,
        occurredAt: message.timestamp,
        text: content,
      },
    };
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

  async gatewayUrl(): Promise<string> {
    const validation = this.validateConfig();
    if (!validation.valid)
      throw new DiscordConnectorError(
        validation.errors.join('; '),
        'bot_required',
      );
    const response = await this.fetchImpl(
      `${DISCORD_API_ORIGIN}/api/v${DISCORD_API_VERSION}/gateway/bot`,
      {
        headers: { authorization: `Bot ${this.config.botToken!.trim()}` },
        redirect: 'error',
      },
    );
    if (!response.ok) {
      throw new DiscordConnectorError(
        `Discord gateway discovery failed with HTTP ${response.status}.`,
        response.status === 401
          ? 'authentication_failed'
          : response.status === 429
            ? 'rate_limited'
            : 'upstream_error',
        response.status,
      );
    }
    const payload = (await response.json()) as { url?: string };
    if (!payload.url?.startsWith('wss://'))
      throw new DiscordConnectorError(
        'Discord returned an invalid Gateway URL.',
        'upstream_error',
      );
    return payload.url;
  }
}

type GatewayPayload = {
  op?: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

export class DiscordGatewayService {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sequence: number | null = null;
  private stopped = false;
  private readonly connector: DiscordConnector;
  private readonly handlers: {
    onMessage: (message: DiscordMessagePayload) => Promise<void> | void;
    onStatus?: (status: string, detail?: string) => void;
  };

  constructor(
    connector: DiscordConnector,
    handlers: {
      onMessage: (message: DiscordMessagePayload) => Promise<void> | void;
      onStatus?: (status: string, detail?: string) => void;
    },
  ) {
    this.connector = connector;
    this.handlers = handlers;
  }

  async start() {
    const validation = this.connector.validateConfig();
    if (!validation.valid)
      throw new DiscordConnectorError(
        validation.errors.join('; '),
        'bot_required',
      );
    this.stopped = false;
    const gateway = new URL(await this.connector.gatewayUrl());
    gateway.searchParams.set('v', String(DISCORD_API_VERSION));
    gateway.searchParams.set('encoding', 'json');
    const factory =
      this.connector.config.webSocketFactory ??
      ((url: string) => new WebSocket(url));
    this.socket = factory(gateway.toString());
    this.socket.addEventListener('open', () =>
      this.handlers.onStatus?.('connected'),
    );
    this.socket.addEventListener(
      'message',
      (event) => void this.handlePayload(String(event.data)),
    );
    this.socket.addEventListener('close', (event) => {
      this.clearHeartbeat();
      const permissionFailure = event.code === 4014;
      this.handlers.onStatus?.(
        permissionFailure ? 'permission_required' : 'disconnected',
        permissionFailure
          ? 'Discord MESSAGE_CONTENT intent is unavailable.'
          : `Gateway closed with code ${event.code}.`,
      );
      if (!this.stopped && !permissionFailure) {
        this.reconnectTimer = setTimeout(() => {
          if (!this.stopped) void this.start();
        }, 2_000);
      }
    });
    this.socket.addEventListener('error', () =>
      this.handlers.onStatus?.('error', 'Discord Gateway transport error.'),
    );
  }

  stop() {
    this.stopped = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'TCG Scout service stopped');
    this.socket = null;
  }

  private async handlePayload(raw: string) {
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(raw) as GatewayPayload;
    } catch {
      return;
    }
    if (typeof payload.s === 'number') this.sequence = payload.s;
    if (payload.op === 10) {
      const interval = Number(
        (payload.d as { heartbeat_interval?: number } | null)
          ?.heartbeat_interval,
      );
      if (!Number.isFinite(interval) || interval < 1_000) return;
      this.clearHeartbeat();
      this.heartbeat = setInterval(
        () => this.send({ op: 1, d: this.sequence }),
        interval,
      );
      this.send({
        op: 2,
        d: {
          token: this.connector.config.botToken,
          intents:
            GUILDS_INTENT | GUILD_MESSAGES_INTENT | MESSAGE_CONTENT_INTENT,
          properties: {
            os: 'linux',
            browser: 'tcg-scout',
            device: 'tcg-scout',
          },
        },
      });
      return;
    }
    if (payload.op === 7 || payload.op === 9) {
      this.socket?.close(4000, 'Reconnect requested');
      return;
    }
    if (payload.op === 0 && payload.t === 'MESSAGE_CREATE') {
      await this.handlers.onMessage(payload.d as DiscordMessagePayload);
    }
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(payload));
  }

  private clearHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export const discordInternals = { parseAllowlist, safeSnowflake };
