import { getRequestUser } from './server/user.ts';

export const DISCORD_PERMISSIONS = '66560';
export const WORKER_STALE_MS = 120_000;
export const snowflake = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{5,30}$/.test(value);
export const splitIds = (value?: string) => [
  ...new Set(
    (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(snowflake),
  ),
];

export function isCommunityAdmin(request: Request, adminEmail?: string) {
  const user = getRequestUser(request);
  return Boolean(
    user &&
    adminEmail?.trim() &&
    user.email.toLowerCase() === adminEmail.trim().toLowerCase(),
  );
}

export function discordInviteUrl(applicationId?: string) {
  if (!snowflake(applicationId)) return null;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: applicationId,
    scope: 'bot',
    permissions: DISCORD_PERMISSIONS,
    integration_type: '0',
  }).toString();
  return url.toString();
}

export function workerConnection(
  row: Record<string, unknown> | null,
  configured: boolean,
  now = Date.now(),
) {
  if (!configured)
    return {
      connected: false,
      status: 'bot_required',
      detail: 'Complete the Discord connection checklist.',
    };
  if (!row)
    return {
      connected: false,
      status: 'worker_required',
      detail:
        'No listener heartbeat received. Start the separate Discord worker.',
    };
  const fresh =
    now - Number(row.updated_at) < WORKER_STALE_MS &&
    Number(row.updated_at) <= now;
  return {
    connected: fresh && row.status === 'connected',
    status: fresh ? String(row.status) : 'worker_offline',
    detail: fresh
      ? typeof row.detail === 'string' && row.detail
        ? row.detail
        : 'Listener heartbeat received. Waiting for permitted TCG messages.'
      : 'The listener has not checked in for more than two minutes.',
  };
}

export async function sameSecret(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [received, expected].map((value) =>
      crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  );
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function readDiscordBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32_768) {
      await reader.cancel();
      throw new Error('Payload too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Invalid JSON.');
  return result as Record<string, unknown>;
}
