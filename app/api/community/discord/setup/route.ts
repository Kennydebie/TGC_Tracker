import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { isCommunityAdmin } from '@/lib/discord-setup';
import { rejectCrossSiteMutation } from '@/lib/security';
import { discordSetup } from '@/lib/services/discord-connection';

export const dynamic = 'force-dynamic';
async function respond(request: Request, probe: boolean) {
  if (!isCommunityAdmin(request, env.COMMUNITY_ADMIN_EMAIL))
    return Response.json(
      {
        error:
          'Sign in with the app owner’s ChatGPT account to connect Discord.',
      },
      { status: 403 },
    );
  if (probe) {
    const denied = rejectCrossSiteMutation(request);
    if (denied) return denied;
  }
  return Response.json(
    { data: await discordSetup(getD1(), env, probe) },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
export async function GET(request: Request) {
  return respond(request, false);
}
export async function POST(request: Request) {
  return respond(request, true);
}
