import { DiscordConnector } from '../connectors/discord.ts';
import {
  discordInviteUrl,
  splitIds,
  workerConnection,
} from '../discord-setup.ts';

export async function discordRuntime(db: D1Database, env: Cloudflare.Env) {
  const rows = await db
    .prepare(`SELECT external_community_id AS guild, external_channel_id AS channel
    FROM community_sources WHERE platform = 'discord' AND enabled = 1 AND data_mode = 'production'`)
    .all<{ guild: string; channel: string }>();
  const guilds = splitIds(env.DISCORD_GUILD_ALLOWLIST);
  const channels = splitIds(env.DISCORD_CHANNEL_ALLOWLIST);
  return {
    applicationId: env.DISCORD_APPLICATION_ID ?? '',
    guildAllowlist: [
      ...new Set([...guilds, ...rows.results.map((row) => row.guild)]),
    ],
    channelAllowlist: [
      ...new Set([...channels, ...rows.results.map((row) => row.channel)]),
    ],
    sources: rows.results,
    environmentGuilds: guilds,
    environmentChannels: channels,
  };
}

export async function discordSetup(
  db: D1Database,
  env: Cloudflare.Env,
  probe = false,
) {
  const runtime = await discordRuntime(db, env);
  const connector = new DiscordConnector({
    ...runtime,
    botToken: env.DISCORD_BOT_TOKEN,
  });
  const health = await db
    .prepare('SELECT * FROM discord_worker_health WHERE id = ?')
    .bind('primary')
    .first<Record<string, unknown>>();
  const configured =
    connector.validateConfig().valid &&
    Boolean(
      env.COMMUNITY_INGEST_SECRET &&
      env.COMMUNITY_AUTHOR_HASH_SALT &&
      env.COMMUNITY_ADMIN_EMAIL,
    );
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: 'App secrets',
      ok: Boolean(
        env.DISCORD_BOT_TOKEN &&
        env.DISCORD_APPLICATION_ID &&
        env.COMMUNITY_INGEST_SECRET &&
        env.COMMUNITY_AUTHOR_HASH_SALT &&
        env.COMMUNITY_ADMIN_EMAIL,
      ),
      detail:
        'Bot token, application ID, ingestion secret, author salt and owner account must be configured on the server.',
    },
    {
      label: 'Selected channels',
      ok:
        runtime.guildAllowlist.length > 0 &&
        runtime.channelAllowlist.length > 0,
      detail: `${runtime.guildAllowlist.length} server(s), ${runtime.channelAllowlist.length} channel(s) selected.`,
    },
  ];
  if (probe && env.DISCORD_BOT_TOKEN) {
    const get = async (path: string) => {
      const response = await fetch(`https://discord.com/api/v10${path}`, {
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN!.trim()}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Bot token rejected. Replace the server secret.'
            : response.status === 403 || response.status === 404
              ? 'Bot cannot access this server or channel. Check installation and channel permissions.'
              : response.status === 429
                ? 'Discord rate limit reached. Wait before testing again.'
                : `Discord returned HTTP ${response.status}.`,
        );
      return response.json() as Promise<Record<string, unknown>>;
    };
    try {
      const app = await get('/applications/@me');
      const matching = app.id === runtime.applicationId;
      checks.push({
        label: 'Bot identity',
        ok: matching,
        detail: matching
          ? 'Bot token matches the application ID.'
          : 'Application ID does not match the bot token.',
      });
      const intent = Boolean(Number(app.flags) & ((1 << 18) | (1 << 19)));
      checks.push({
        label: 'Message Content Intent',
        ok: intent,
        detail: intent
          ? 'Discord reports message content access enabled.'
          : 'Enable Message Content Intent on the Bot page in the Developer Portal.',
      });
      for (const channelId of runtime.channelAllowlist.slice(0, 20)) {
        try {
          const channel = await get(`/channels/${channelId}`);
          const allowed =
            runtime.sources.some(
              (row) =>
                row.guild === channel.guild_id && row.channel === channelId,
            ) ||
            (runtime.environmentChannels.includes(channelId) &&
              runtime.environmentGuilds.includes(String(channel.guild_id)));
          if (!allowed)
            throw new Error(
              'Channel belongs to a different server than the selected source.',
            );
          await get(`/channels/${channelId}/messages?limit=1`);
          checks.push({
            label: `Channel ${typeof channel.name === 'string' ? channel.name : channelId}`,
            ok: true,
            detail: 'Bot can view this channel and read its history.',
          });
        } catch (error) {
          checks.push({
            label: `Channel ${channelId}`,
            ok: false,
            detail:
              error instanceof Error ? error.message : 'Channel check failed.',
          });
        }
      }
      if (runtime.channelAllowlist.length > 20)
        checks.push({
          label: 'Remaining channels',
          ok: false,
          detail:
            'Only the first 20 channels were tested. Reduce the selection to check all channels.',
        });
    } catch (error) {
      checks.push({
        label: 'Discord access',
        ok: false,
        detail:
          error instanceof Error
            ? error.message
            : 'Discord could not be reached.',
      });
    }
  }
  const connection = workerConnection(health, configured);
  checks.push({
    label: 'Always-running listener',
    ok: connection.connected,
    detail: connection.detail,
  });
  return {
    ...connection,
    applicationId: runtime.applicationId,
    inviteUrl: discordInviteUrl(runtime.applicationId),
    checks,
    lastHeartbeatAt: health?.updated_at
      ? new Date(Number(health.updated_at)).toISOString()
      : null,
    lastMessageAt: health?.last_message_at
      ? new Date(Number(health.last_message_at)).toISOString()
      : null,
    lastIngestAt: health?.last_ingest_at
      ? new Date(Number(health.last_ingest_at)).toISOString()
      : null,
    channelCount: runtime.channelAllowlist.length,
    guildCount: runtime.guildAllowlist.length,
  };
}
