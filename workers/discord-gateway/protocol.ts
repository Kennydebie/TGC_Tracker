export const DISCORD_GATEWAY_VERSION = 10;
export const DISCORD_GATEWAY_INTENTS =
  (1 << 0) | // GUILDS
  (1 << 9) | // GUILD_MESSAGES
  (1 << 15); // MESSAGE_CONTENT

const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
const INVALID_SESSION_CLOSE_CODES = new Set([1000, 1001, 4007, 4009]);

export type GatewayCloseDisposition = {
  fatal: boolean;
  clearSession: boolean;
  status: 'authentication_failed' | 'permission_required' | 'disconnected';
};

export function gatewayCloseDisposition(code: number): GatewayCloseDisposition {
  const fatal = FATAL_CLOSE_CODES.has(code);
  return {
    fatal,
    clearSession: fatal || INVALID_SESSION_CLOSE_CODES.has(code),
    status:
      code === 4004
        ? 'authentication_failed'
        : fatal
          ? 'permission_required'
          : 'disconnected',
  };
}

export function reconnectDelayMs(attempt: number, jitter = Math.random()) {
  const boundedAttempt = Math.max(0, Math.min(5, Math.floor(attempt)));
  const boundedJitter = Math.max(0, Math.min(1, jitter));
  return Math.min(60_000, 2_000 * 2 ** boundedAttempt + boundedJitter * 1_000);
}

export function gatewayDiscoveryDisposition(
  status: number,
  retryAfterHeader: string | null,
) {
  const retrySeconds = Number(retryAfterHeader);
  return {
    fatal: status === 401 || status === 403,
    status:
      status === 401 || status === 403
        ? ('authentication_failed' as const)
        : ('disconnected' as const),
    retryAfterMs:
      status === 429 && Number.isFinite(retrySeconds)
        ? Math.max(1_000, Math.min(15 * 60_000, retrySeconds * 1_000))
        : null,
  };
}

export function gatewayHandshakeExpired(
  socketCreatedAt: number,
  helloReceivedAt: number,
  readyAt: number,
  now = Date.now(),
) {
  if (readyAt > 0 || socketCreatedAt <= 0) return false;
  const startedAt = helloReceivedAt > 0 ? helloReceivedAt : socketCreatedAt;
  const timeout = helloReceivedAt > 0 ? 30_000 : 20_000;
  return now - startedAt >= timeout;
}

export function isPendingExpired(
  queuedAt: number,
  now = Date.now(),
  retentionMs = 24 * 60 * 60 * 1_000,
) {
  return !Number.isFinite(queuedAt) || queuedAt <= now - retentionMs;
}

export function validDiscordIngestUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname.endsWith('/api/community/discord/events')
    );
  } catch {
    return false;
  }
}
