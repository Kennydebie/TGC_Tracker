import { env } from 'cloudflare:workers';

import { isCommunityAdmin } from '@/lib/discord-setup';
import { discordSetup } from '@/lib/services/discord-connection';
import { emptyCommunityDashboard } from '@/lib/community';

import { getD1 } from '@/db';
import { listCommunityDashboard } from '@/lib/repositories/community';
import { listScoutResearchDashboard } from '@/lib/repositories/scout-ingestion';
import { getRequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  const admin = isCommunityAdmin(request, env.COMMUNITY_ADMIN_EMAIL);
  const db = getD1();
  const research = user
    ? await listScoutResearchDashboard(db, user)
    : { findings: [], importStatus: null };
  if (!admin) {
    const data = emptyCommunityDashboard({
      reddit: {
        connected: false,
        status: 'owner_sign_in_required',
        detail: 'Sign in as the app owner to view production community data.',
      },
      discord: {
        connected: false,
        status: 'owner_sign_in_required',
        detail: 'Sign in as the app owner to view production community data.',
      },
    });
    if (research.importStatus) {
      data.researchFindings = research.findings;
      data.researchImport = research.importStatus;
    }
    return Response.json(
      { data },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  }
  const data = await listCommunityDashboard(db, {
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
  const connection = await discordSetup(db, env);
  data.discord = {
    connected: connection.connected,
    status: connection.status,
    detail: connection.detail,
  };
  data.researchFindings = research.findings;
  if (research.importStatus) data.researchImport = research.importStatus;
  return Response.json(
    { data },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
