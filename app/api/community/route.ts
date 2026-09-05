import { env } from 'cloudflare:workers';

import { isCommunityAdmin } from '@/lib/discord-setup';
import { discordSetup } from '@/lib/services/discord-connection';
import { communityFixtureDashboard } from '@/lib/fixtures-community';

import { getD1 } from '@/db';
import { listCommunityDashboard } from '@/lib/repositories/community';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isCommunityAdmin(request, env.COMMUNITY_ADMIN_EMAIL))
    return Response.json(
      { data: communityFixtureDashboard() },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  const data = await listCommunityDashboard(getD1(), {
    redditCredentialsAvailable: Boolean(
      env.REDDIT_CLIENT_ID?.trim() &&
      env.REDDIT_CLIENT_SECRET?.trim() &&
      env.REDDIT_USER_AGENT?.trim(),
    ),
    discordCredentialsAvailable: Boolean(
      env.DISCORD_BOT_TOKEN?.trim() &&
      env.DISCORD_APPLICATION_ID?.trim() &&
      env.DISCORD_GUILD_ALLOWLIST?.trim() &&
      env.DISCORD_CHANNEL_ALLOWLIST?.trim(),
    ),
  });
  const connection = await discordSetup(getD1(), env);
  data.discord = {
    connected: connection.connected,
    status: connection.status,
    detail: connection.detail,
  };
  return Response.json(
    { data },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
