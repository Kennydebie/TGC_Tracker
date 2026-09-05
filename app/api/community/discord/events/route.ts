import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { readDiscordBody, sameSecret } from '@/lib/discord-setup';
import { discordRuntime } from '@/lib/services/discord-connection';
import { processDiscordCommunityMessage } from '@/lib/services/community-radar';

async function authorize(request: Request) {
  const expected = env.COMMUNITY_INGEST_SECRET?.trim();
  if (!expected)
    return Response.json(
      { error: 'Discord ingestion is not configured.' },
      { status: 503 },
    );
  const token =
    request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!token || !(await sameSecret(token, expected)))
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  return null;
}
export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const runtime = await discordRuntime(getD1(), env);
  return Response.json(
    { data: runtime },
    { headers: { 'cache-control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  let message: Record<string, unknown>;
  try {
    message = await readDiscordBody(request);
  } catch (error) {
    const large =
      error instanceof Error && error.message === 'Payload too large.';
    return Response.json(
      { error: large ? 'Payload too large.' : 'Invalid JSON.' },
      { status: large ? 413 : 400 },
    );
  }
  const db = getD1(),
    now = Date.now();
  if (message.kind === 'heartbeat') {
    const statuses = [
      'connected',
      'disconnected',
      'connecting',
      'permission_required',
      'authentication_failed',
      'delivery_error',
    ];
    if (!statuses.includes(String(message.status)))
      return Response.json(
        { error: 'Invalid worker status.' },
        { status: 400 },
      );
    // Details are fixed strings: never reflect arbitrary worker text or credentials.
    const detail =
      message.status === 'connected'
        ? 'Gateway ready; listener checked in.'
        : 'Listener needs attention. Check worker logs and run connection checks.';
    await db
      .prepare(`INSERT INTO discord_worker_health (id, status, detail, updated_at) VALUES ('primary', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at`)
      .bind(message.status, detail, now)
      .run();
    await db
      .prepare(
        'UPDATE community_signals SET raw_excerpt = NULL WHERE raw_expires_at < ?',
      )
      .bind(now)
      .run();
    return Response.json({ ok: true });
  }
  const runtime = await discordRuntime(db, env);
  const allowed =
    runtime.sources.some(
      (row) =>
        row.guild === message.guild_id && row.channel === message.channel_id,
    ) ||
    (runtime.environmentGuilds.includes(String(message.guild_id)) &&
      runtime.environmentChannels.includes(String(message.channel_id)));
  if (!allowed)
    return Response.json({ accepted: false, reason: 'source_not_allowed' });
  // Schema validation prevents malformed arrays or content from crashing ingestion.
  if (
    typeof message.id !== 'string' ||
    typeof message.timestamp !== 'string' ||
    (message.content !== undefined && typeof message.content !== 'string') ||
    (message.embeds !== undefined &&
      (!Array.isArray(message.embeds) ||
        message.embeds.some((item) => !item || typeof item !== 'object'))) ||
    (message.attachments !== undefined &&
      (!Array.isArray(message.attachments) ||
        message.attachments.some((item) => !item || typeof item !== 'object')))
  )
    return Response.json(
      { error: 'Invalid message payload.' },
      { status: 400 },
    );
  const result = await processDiscordCommunityMessage({
    db,
    env: {
      ...env,
      DISCORD_GUILD_ALLOWLIST: runtime.guildAllowlist.join(','),
      DISCORD_CHANNEL_ALLOWLIST: runtime.channelAllowlist.join(','),
    },
    message,
  });
  if (result.accepted)
    await db
      .prepare(
        `UPDATE discord_worker_health SET last_message_at = ?, last_ingest_at = ? WHERE id = 'primary'`,
      )
      .bind(now, now)
      .run();
  return Response.json(result, { status: result.accepted ? 202 : 200 });
}
