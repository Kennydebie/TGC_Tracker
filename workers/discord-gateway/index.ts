import { DurableObject } from 'cloudflare:workers';

import {
  compactDiscordMessage,
  DiscordConnector,
  type DiscordMessagePayload,
} from '../../lib/connectors/discord.ts';
import {
  DISCORD_GATEWAY_INTENTS,
  DISCORD_GATEWAY_VERSION,
  gatewayCloseDisposition,
  gatewayDiscoveryDisposition,
  gatewayHandshakeExpired,
  isPendingExpired,
  reconnectDelayMs,
  validDiscordIngestUrl,
} from './protocol.ts';

interface DiscordGatewayEnvironment {
  DISCORD_GATEWAY: DurableObjectNamespace;
  DISCORD_BOT_TOKEN?: string;
  COMMUNITY_INGEST_SECRET?: string;
  DISCORD_INGEST_URL?: string;
}

type ListenerStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'permission_required'
  | 'authentication_failed'
  | 'delivery_error';

type GatewayPayload = {
  op?: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

type StoredSession = {
  sessionId: string | null;
  resumeUrl: string | null;
  sequence: number | null;
  attempts: number;
  reconnectAt: number;
};

type PendingDelivery = {
  queuedAt: number;
  message: DiscordMessagePayload;
};

const PRIMARY_OBJECT = 'primary';
const SESSION_KEY = 'gateway-session';
const PENDING_COUNT_KEY = 'pending-count';
const PENDING_PREFIX = 'pending:';
const PENDING_ID_PREFIX = 'pending-id:';
const MAX_PENDING = 2_000;
const DELIVERY_BATCH_SIZE = 25;
const PURGE_BATCH_SIZE = 25;
const MAX_DELIVERY_BYTES = 32_768;
const MAINTENANCE_INTERVAL_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 60_000;
const FATAL_RETRY_MS = 15 * 60 * 1_000;
const CONFIG_REFRESH_MS = 30_000;
const HANDLED_REJECTIONS = new Set([
  'source_not_allowed',
  'irrelevant',
  'bot_message_ignored',
  'channel_not_allowed',
  'guild_not_allowed',
  'direct_message_ignored',
  'message_content_unavailable',
  'invalid_payload',
]);

class GatewayDiscoveryError extends Error {
  constructor(
    readonly disposition: ReturnType<typeof gatewayDiscoveryDisposition>,
    status: number,
  ) {
    super(`Discord Gateway discovery returned ${status}.`);
  }
}

class DeliveryQueueFullError extends Error {}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function safeGatewayUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'wss:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeSnowflake(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5,30}$/.test(value);
}

const worker: ExportedHandler<DiscordGatewayEnvironment> = {
  fetch() {
    return jsonResponse(404, { error: 'Not found.' });
  },
  scheduled(_controller, env, execution) {
    const object = env.DISCORD_GATEWAY.getByName(PRIMARY_OBJECT, {
      locationHint: 'weur',
    });
    execution.waitUntil(
      object
        .fetch('https://discord-gateway.internal/ensure', { method: 'POST' })
        .then((response) => {
          if (!response.ok)
            console.error(
              JSON.stringify({
                service: 'discord-gateway',
                event: 'ensure_failed',
                status: response.status,
              }),
            );
        }),
    );
  },
};

export default worker;

export class DiscordGateway extends DurableObject<DiscordGatewayEnvironment> {
  private readonly connector: DiscordConnector;
  private readonly ready: Promise<void>;
  private socket: WebSocket | null = null;
  private connecting = false;
  private configValid = false;
  private lastConfigAt = 0;
  private status: ListenerStatus = 'connecting';
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private attempts = 0;
  private reconnectAt = 0;
  private retryDeliveryAt = 0;
  private configurationFailure = false;
  private deliveryFailure = false;
  private acknowledged = true;
  private socketCreatedAt = 0;
  private helloReceivedAt = 0;
  private readyAt = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private maintenanceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private queueAtCapacity = false;
  private gatewayDispatch: Promise<void> = Promise.resolve();
  private persistedSession: StoredSession = {
    sessionId: null,
    resumeUrl: null,
    sequence: null,
    attempts: 0,
    reconnectAt: 0,
  };

  constructor(ctx: DurableObjectState, env: DiscordGatewayEnvironment) {
    super(ctx, env);
    this.connector = new DiscordConnector({ botToken: env.DISCORD_BOT_TOKEN });
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const session = await ctx.storage.get<StoredSession>(SESSION_KEY);
      if (session) {
        this.sessionId = session.sessionId;
        this.resumeUrl = safeGatewayUrl(session.resumeUrl);
        this.sequence = Number.isSafeInteger(session.sequence)
          ? session.sequence
          : null;
        this.attempts = Math.max(0, Math.min(10, session.attempts || 0));
        this.reconnectAt = Math.max(0, session.reconnectAt || 0);
      }
      this.persistedSession = this.sessionSnapshot();
      if ((await ctx.storage.get<number>(PENDING_COUNT_KEY)) === undefined)
        await ctx.storage.put(PENDING_COUNT_KEY, 0);
    });
  }

  async fetch(request: Request) {
    if (
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/ensure'
    )
      return jsonResponse(404, { error: 'Not found.' });
    await this.ensureOnline();
    return jsonResponse(200, { ok: true, status: this.status });
  }

  async alarm() {
    await this.ensureOnline();
  }

  private async ensureOnline() {
    await this.ready;
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_INTERVAL_MS);
    try {
      await this.maintain();
    } finally {
      this.scheduleMaintenance();
    }
  }

  private async maintain() {
    try {
      await this.purgeExpiredPending();
    } catch {
      this.deliveryFailure = true;
      console.error(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'retention_cleanup_failed',
        }),
      );
    }
    await this.expireStalledGateway();
    if (Date.now() - this.lastConfigAt >= CONFIG_REFRESH_MS) {
      try {
        await this.syncConfig();
      } catch {
        this.configurationFailure = true;
        console.error(
          JSON.stringify({
            service: 'discord-gateway',
            event: 'configuration_sync_failed',
          }),
        );
      }
    }
    try {
      await this.flushPending();
    } catch {
      this.deliveryFailure = true;
      console.error(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'delivery_flush_failed',
        }),
      );
    }
    try {
      await this.sendAppHeartbeat();
    } catch {
      // The alarm and scheduled trigger retry app delivery independently.
    }
    await this.refreshQueueCapacity();
    try {
      if (
        this.configValid &&
        !this.queueAtCapacity &&
        !this.socket &&
        !this.connecting &&
        Date.now() >= this.reconnectAt
      )
        await this.connectGateway();
    } catch {
      console.error(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'maintenance_failed',
        }),
      );
    }
  }

  private scheduleMaintenance() {
    if (this.maintenanceTimer) return;
    this.maintenanceTimer = setTimeout(() => {
      this.maintenanceTimer = null;
      this.ctx.waitUntil(
        this.maintain().finally(() => this.scheduleMaintenance()),
      );
    }, MAINTENANCE_INTERVAL_MS);
  }

  private queueGatewayTask(task: () => Promise<void>) {
    this.gatewayDispatch = this.gatewayDispatch
      .then(task)
      .catch((error) => this.handleGatewayTaskFailure(error));
    this.ctx.waitUntil(this.gatewayDispatch);
  }

  private async handleGatewayTaskFailure(error: unknown) {
    this.deliveryFailure = true;
    console.error(
      JSON.stringify({
        service: 'discord-gateway',
        event: 'gateway_event_failed',
      }),
    );
    const socket = this.socket;
    this.socket = null;
    this.clearHeartbeat();
    this.clearHandshakeState();
    this.sessionId = this.persistedSession.sessionId;
    this.resumeUrl = this.persistedSession.resumeUrl;
    this.sequence = this.persistedSession.sequence;
    this.attempts = this.persistedSession.attempts;
    this.reconnectAt = this.persistedSession.reconnectAt;
    try {
      socket?.close(4000, 'Durable processing failed');
    } catch {
      // The socket is detached so later events cannot advance the sequence.
    }
    this.status = 'disconnected';
    if (error instanceof DeliveryQueueFullError) {
      this.queueAtCapacity = true;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      return;
    }
    this.scheduleReconnect(false);
  }

  private async expireStalledGateway() {
    const socket = this.socket;
    if (!socket) return;
    const closed =
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED;
    if (
      !closed &&
      !gatewayHandshakeExpired(
        this.socketCreatedAt,
        this.helloReceivedAt,
        this.readyAt,
      )
    )
      return;
    this.socket = null;
    this.clearHeartbeat();
    this.clearHandshakeState();
    try {
      if (!closed) socket.close(4000, 'Gateway handshake timed out');
    } catch {
      // The stale reference is already detached; reconnect continues below.
    }
    this.status = 'disconnected';
    this.scheduleReconnect(false);
    await this.persistSession();
  }

  private endpoint() {
    if (
      !this.env.COMMUNITY_INGEST_SECRET?.trim() ||
      !validDiscordIngestUrl(this.env.DISCORD_INGEST_URL)
    )
      throw new Error('Discord listener environment is incomplete.');
    return new URL(this.env.DISCORD_INGEST_URL!);
  }

  private appRequest(method: 'GET' | 'POST', body?: unknown) {
    return fetch(this.endpoint(), {
      method,
      headers: {
        authorization: `Bearer ${this.env.COMMUNITY_INGEST_SECRET!.trim()}`,
        'content-type': 'application/json',
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  }

  private async syncConfig() {
    const response = await this.appRequest('GET');
    if (!response.ok)
      throw new Error(`App configuration returned HTTP ${response.status}.`);
    const payload = (await response.json()) as {
      data?: {
        applicationId?: unknown;
        guildAllowlist?: unknown;
        channelAllowlist?: unknown;
      };
    };
    const applicationId = payload.data?.applicationId;
    const guilds = Array.isArray(payload.data?.guildAllowlist)
      ? payload.data.guildAllowlist.filter(safeSnowflake)
      : [];
    const channels = Array.isArray(payload.data?.channelAllowlist)
      ? payload.data.channelAllowlist.filter(safeSnowflake)
      : [];
    this.connector.config.applicationId = safeSnowflake(applicationId)
      ? applicationId
      : undefined;
    this.connector.guildAllowlist.splice(
      0,
      this.connector.guildAllowlist.length,
      ...new Set(guilds),
    );
    this.connector.channelAllowlist.splice(
      0,
      this.connector.channelAllowlist.length,
      ...new Set(channels),
    );
    this.configValid = this.connector.validateConfig().valid;
    this.configurationFailure = false;
    this.lastConfigAt = Date.now();
    if (!this.configValid && this.socket) {
      this.status = 'permission_required';
      this.socket.close(4000, 'No permitted channels');
    }
  }

  private async sendAppHeartbeat() {
    try {
      const response = await this.appRequest('POST', {
        kind: 'heartbeat',
        status:
          this.configurationFailure || this.deliveryFailure
            ? 'delivery_error'
            : this.status,
      });
      if (!response.ok)
        throw new Error(`Heartbeat returned HTTP ${response.status}.`);
    } catch {
      this.deliveryFailure = true;
      throw new Error('Listener heartbeat failed.');
    }
  }

  private async discoverGateway() {
    const response = await fetch(
      `https://discord.com/api/v${DISCORD_GATEWAY_VERSION}/gateway/bot`,
      {
        headers: {
          authorization: `Bot ${this.env.DISCORD_BOT_TOKEN?.trim() ?? ''}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok)
      throw new GatewayDiscoveryError(
        gatewayDiscoveryDisposition(
          response.status,
          response.headers.get('retry-after'),
        ),
        response.status,
      );
    const payload = (await response.json()) as { url?: unknown };
    const gateway =
      typeof payload.url === 'string' ? safeGatewayUrl(payload.url) : null;
    if (!gateway) throw new Error('Discord returned an invalid Gateway URL.');
    return gateway;
  }

  private async connectGateway() {
    if (this.connecting || this.socket || !this.configValid) return;
    this.connecting = true;
    this.status = 'connecting';
    try {
      const gateway = new URL(this.resumeUrl ?? (await this.discoverGateway()));
      gateway.searchParams.set('v', String(DISCORD_GATEWAY_VERSION));
      gateway.searchParams.set('encoding', 'json');
      const socket = new WebSocket(gateway.toString());
      this.socket = socket;
      this.socketCreatedAt = Date.now();
      this.helloReceivedAt = 0;
      this.readyAt = 0;
      socket.addEventListener('message', (event) => {
        const data = event.data;
        this.queueGatewayTask(async () => {
          if (this.socket !== socket) return;
          await this.handleGatewayData(data);
        });
      });
      socket.addEventListener('close', (event) => {
        const code = event.code;
        this.queueGatewayTask(async () => {
          if (this.socket !== socket) return;
          await this.handleClose(code);
        });
      });
      socket.addEventListener('error', () => {
        if (this.socket !== socket) return;
        try {
          socket.close(4000, 'Transport error');
        } catch {
          this.queueGatewayTask(async () => {
            if (this.socket !== socket) return;
            await this.handleClose(4000);
          });
        }
      });
    } catch (error) {
      this.socket = null;
      this.clearHandshakeState();
      const discovery =
        error instanceof GatewayDiscoveryError ? error.disposition : null;
      this.status = discovery?.status ?? 'disconnected';
      this.scheduleReconnect(
        discovery?.fatal ?? false,
        discovery?.retryAfterMs ?? undefined,
      );
    } finally {
      this.connecting = false;
    }
  }

  private async handleGatewayData(data: unknown) {
    let raw: string;
    if (typeof data === 'string') raw = data;
    else if (data instanceof ArrayBuffer) raw = new TextDecoder().decode(data);
    else if (data instanceof Blob) raw = await data.text();
    else return;
    if (raw.length > 1_000_000) return;
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(raw) as GatewayPayload;
    } catch {
      return;
    }
    if (typeof payload.s === 'number') this.sequence = payload.s;
    if (payload.op === 11) {
      this.acknowledged = true;
      return;
    }
    if (payload.op === 1) {
      this.send({ op: 1, d: this.sequence });
      return;
    }
    if (payload.op === 10) {
      this.helloReceivedAt = Date.now();
      const interval = Number(
        (payload.d as { heartbeat_interval?: unknown } | null)
          ?.heartbeat_interval,
      );
      if (!Number.isFinite(interval) || interval < 1_000) {
        this.socket?.close(4000, 'Invalid heartbeat interval');
        return;
      }
      this.startHeartbeat(interval);
      this.send(
        this.sessionId
          ? {
              op: 6,
              d: {
                token: this.env.DISCORD_BOT_TOKEN,
                session_id: this.sessionId,
                seq: this.sequence,
              },
            }
          : {
              op: 2,
              d: {
                token: this.env.DISCORD_BOT_TOKEN,
                intents: DISCORD_GATEWAY_INTENTS,
                properties: {
                  os: 'linux',
                  browser: 'tcg-scout-cloudflare',
                  device: 'tcg-scout-cloudflare',
                },
              },
            },
      );
      return;
    }
    if (payload.op === 7 || payload.op === 9) {
      if (payload.op === 9 && payload.d !== true) {
        this.clearSession();
        await this.persistSession();
      }
      this.socket?.close(4000, 'Reconnect requested');
      return;
    }
    if (payload.op !== 0) return;
    if (payload.t === 'READY') {
      const ready = payload.d as {
        session_id?: unknown;
        resume_gateway_url?: unknown;
      };
      this.sessionId =
        typeof ready.session_id === 'string' ? ready.session_id : null;
      this.resumeUrl =
        typeof ready.resume_gateway_url === 'string'
          ? safeGatewayUrl(ready.resume_gateway_url)
          : null;
      this.attempts = 0;
      this.reconnectAt = 0;
      this.readyAt = Date.now();
      this.status = 'connected';
      await this.persistSession();
      this.scheduleAppHeartbeat();
      return;
    }
    if (payload.t === 'RESUMED') {
      this.attempts = 0;
      this.reconnectAt = 0;
      this.readyAt = Date.now();
      this.status = 'connected';
      await this.persistSession();
      this.scheduleAppHeartbeat();
      return;
    }
    if (payload.t === 'MESSAGE_CREATE') {
      await this.handleMessage(payload.d as DiscordMessagePayload);
      return;
    }
    await this.persistSession();
  }

  private startHeartbeat(interval: number) {
    this.clearHeartbeat();
    this.acknowledged = true;
    const beat = () => {
      if (!this.acknowledged) {
        this.socket?.close(4000, 'Heartbeat acknowledgement missing');
        return;
      }
      this.acknowledged = false;
      this.send({ op: 1, d: this.sequence });
      this.heartbeatTimer = setTimeout(beat, interval);
    };
    this.heartbeatTimer = setTimeout(beat, Math.random() * interval);
  }

  private async handleClose(code: number) {
    this.clearHeartbeat();
    this.socket = null;
    this.clearHandshakeState();
    this.connecting = false;
    const disposition = gatewayCloseDisposition(code);
    this.status = disposition.status;
    if (disposition.clearSession) this.clearSession();
    this.scheduleReconnect(disposition.fatal);
    await this.persistSession();
    try {
      await this.sendAppHeartbeat();
    } catch {
      // The watchdog and scheduled trigger will retry app delivery.
    }
  }

  private scheduleReconnect(fatal: boolean, requestedDelay?: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay =
      requestedDelay ??
      (fatal ? FATAL_RETRY_MS : reconnectDelayMs(this.attempts++));
    this.reconnectAt = Date.now() + delay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.configValid) this.ctx.waitUntil(this.connectGateway());
    }, delay);
    this.ctx.waitUntil(this.persistSession());
  }

  private async handleMessage(message: DiscordMessagePayload) {
    const result = this.connector.normaliseMessage(message);
    if (!result.accepted && result.reason !== 'message_content_unavailable') {
      await this.persistSession();
      return;
    }
    const compact = compactDiscordMessage(message);
    if (
      new TextEncoder().encode(JSON.stringify(compact)).byteLength >
      MAX_DELIVERY_BYTES
    ) {
      await this.persistSession();
      console.warn(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'oversized_delivery_dropped',
        }),
      );
      return;
    }
    const outcome = await this.enqueueWithSession(compact);
    if (outcome === 'full') {
      this.deliveryFailure = true;
      console.error(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'delivery_queue_full',
        }),
      );
      this.scheduleFlush();
      throw new DeliveryQueueFullError('Delivery queue is at capacity.');
    }
    this.scheduleFlush();
  }

  private scheduleFlush() {
    this.ctx.waitUntil(
      this.flushPending().catch(() => {
        this.deliveryFailure = true;
        console.error(
          JSON.stringify({
            service: 'discord-gateway',
            event: 'delivery_flush_failed',
          }),
        );
      }),
    );
  }

  private scheduleAppHeartbeat() {
    this.ctx.waitUntil(this.sendAppHeartbeat().catch(() => undefined));
  }

  private async deliver(message: DiscordMessagePayload) {
    try {
      const response = await this.appRequest('POST', message);
      if (response.status === 400 || response.status === 413) return true;
      if (!response.ok) {
        this.deliveryFailure = true;
        const retryAfter = Number(response.headers.get('retry-after'));
        this.retryDeliveryAt =
          Date.now() +
          Math.max(
            5_000,
            Number.isFinite(retryAfter)
              ? Math.min(retryAfter * 1_000, 300_000)
              : 5_000,
          );
        return false;
      }
      const result = (await response.json()) as {
        accepted?: unknown;
        reason?: unknown;
      };
      const handled =
        result.accepted === true ||
        (typeof result.reason === 'string' &&
          HANDLED_REJECTIONS.has(result.reason));
      if (!handled) this.deliveryFailure = true;
      return handled;
    } catch {
      this.deliveryFailure = true;
      this.retryDeliveryAt = Date.now() + 5_000;
      return false;
    }
  }

  private async enqueueWithSession(message: DiscordMessagePayload) {
    if (!safeSnowflake(message.id)) {
      await this.persistSession();
      return 'invalid' as const;
    }
    const idKey = `${PENDING_ID_PREFIX}${message.id}`;
    const queuedAt = Date.now();
    const key = `${PENDING_PREFIX}${String(queuedAt).padStart(13, '0')}:${message.id}`;
    const outcome = await this.ctx.storage.transaction(
      async (transaction): Promise<'queued' | 'duplicate' | 'full'> => {
        if (await transaction.get(idKey)) {
          await transaction.put(SESSION_KEY, this.sessionSnapshot());
          return 'duplicate';
        }
        const count = (await transaction.get<number>(PENDING_COUNT_KEY)) ?? 0;
        if (count >= MAX_PENDING) return 'full';
        await transaction.put(SESSION_KEY, this.sessionSnapshot());
        await transaction.put(key, {
          queuedAt,
          message,
        } satisfies PendingDelivery);
        await transaction.put(idKey, key);
        await transaction.put(PENDING_COUNT_KEY, count + 1);
        return 'queued';
      },
    );
    if (outcome !== 'full') this.persistedSession = this.sessionSnapshot();
    return outcome;
  }

  private async flushPending() {
    if (this.flushing || Date.now() < this.retryDeliveryAt) return;
    this.flushing = true;
    let failed = false;
    try {
      const pending = await this.ctx.storage.list<PendingDelivery>({
        prefix: PENDING_PREFIX,
        limit: DELIVERY_BATCH_SIZE,
      });
      for (const [key, item] of pending) {
        if (isPendingExpired(item.queuedAt)) {
          await this.removePending(key, item.message.id);
          continue;
        }
        if (!(await this.deliver(item.message))) {
          failed = true;
          break;
        }
        await this.removePending(key, item.message.id);
      }
      if (!failed) {
        const remaining =
          (await this.ctx.storage.get<number>(PENDING_COUNT_KEY)) ?? 0;
        this.queueAtCapacity = remaining >= MAX_PENDING;
        this.deliveryFailure = remaining > 0;
        if (remaining > 0) await this.ctx.storage.setAlarm(Date.now() + 1_000);
      } else {
        await this.ctx.storage.setAlarm(
          Math.max(Date.now() + 1_000, this.retryDeliveryAt),
        );
      }
    } finally {
      this.flushing = false;
    }
  }

  private async purgeExpiredPending() {
    let removed = 0;
    await this.ctx.storage.transaction(async (transaction) => {
      const pending = await transaction.list<PendingDelivery>({
        prefix: PENDING_PREFIX,
        limit: PURGE_BATCH_SIZE,
      });
      const expired: Array<[string, PendingDelivery]> = [];
      for (const entry of pending) {
        if (!isPendingExpired(entry[1].queuedAt)) break;
        expired.push(entry);
      }
      if (!expired.length) return;
      const keys = expired.flatMap(([key, item]) => [
        key,
        ...(safeSnowflake(item.message.id)
          ? [`${PENDING_ID_PREFIX}${item.message.id}`]
          : []),
      ]);
      await transaction.delete(keys);
      removed = expired.length;
      const count = (await transaction.get<number>(PENDING_COUNT_KEY)) ?? 0;
      await transaction.put(PENDING_COUNT_KEY, Math.max(0, count - removed));
    });
    if (removed === PURGE_BATCH_SIZE)
      await this.ctx.storage.setAlarm(Date.now() + 1_000);
    if (removed > 0)
      console.warn(
        JSON.stringify({
          service: 'discord-gateway',
          event: 'expired_deliveries_removed',
          count: removed,
        }),
      );
  }

  private async refreshQueueCapacity() {
    const count = (await this.ctx.storage.get<number>(PENDING_COUNT_KEY)) ?? 0;
    this.queueAtCapacity = count >= MAX_PENDING;
  }

  private async removePending(key: string, messageId: string | undefined) {
    await this.ctx.storage.transaction(async (transaction) => {
      const existed = await transaction.delete(key);
      if (!existed) return;
      if (safeSnowflake(messageId))
        await transaction.delete(`${PENDING_ID_PREFIX}${messageId}`);
      const count = (await transaction.get<number>(PENDING_COUNT_KEY)) ?? 1;
      await transaction.put(PENDING_COUNT_KEY, Math.max(0, count - 1));
    });
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(payload));
  }

  private clearSession() {
    this.sessionId = null;
    this.resumeUrl = null;
    this.sequence = null;
  }

  private sessionSnapshot(): StoredSession {
    return {
      sessionId: this.sessionId,
      resumeUrl: this.resumeUrl,
      sequence: this.sequence,
      attempts: this.attempts,
      reconnectAt: this.reconnectAt,
    };
  }

  private async persistSession() {
    const snapshot = this.sessionSnapshot();
    await this.ctx.storage.put(SESSION_KEY, snapshot);
    this.persistedSession = snapshot;
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearHandshakeState() {
    this.socketCreatedAt = 0;
    this.helloReceivedAt = 0;
    this.readyAt = 0;
  }
}
