import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import { isCommunityAdmin } from '@/lib/discord-setup';
import { revokeScoutIntegrationCredential } from '@/lib/repositories/scout-integration';
import { scoutIntegrationJsonResponse } from '@/lib/scout-integration';
import { rejectCrossSiteMutation } from '@/lib/security';
import { getRequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getRequestUser(request);
  if (!user)
    return scoutIntegrationJsonResponse(
      { error: 'Sign in with ChatGPT to manage integration credentials.' },
      { status: 401 },
    );
  if (!isCommunityAdmin(request, env.COMMUNITY_ADMIN_EMAIL))
    return scoutIntegrationJsonResponse(
      { error: 'Only the app owner can manage integration credentials.' },
      { status: 403 },
    );
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) {
    blocked.headers.set('cache-control', 'private, no-store');
    return blocked;
  }
  const { id } = await params;
  try {
    const revoked = await revokeScoutIntegrationCredential(getD1(), user, id);
    return revoked
      ? new Response(null, {
          status: 204,
          headers: { 'cache-control': 'private, no-store' },
        })
      : scoutIntegrationJsonResponse(
          { error: 'Integration credential not found.' },
          { status: 404 },
        );
  } catch {
    return scoutIntegrationJsonResponse(
      { error: 'Could not revoke the integration credential.' },
      { status: 500 },
    );
  }
}
