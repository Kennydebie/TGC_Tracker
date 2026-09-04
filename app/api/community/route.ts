import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import { listCommunityDashboard } from '@/lib/repositories/community';

export const dynamic = 'force-dynamic';

export async function GET() {
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
  return Response.json(
    { data },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
