import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import { isCommunityAdmin } from '@/lib/discord-setup';
import {
  createScoutIntegrationCredential,
  listScoutIntegrationCredentials,
} from '@/lib/repositories/scout-integration';
import {
  createScoutIntegrationCredentialSchema,
  readBoundedJson,
  scoutIntegrationJsonResponse,
  ScoutIntegrationCredentialError,
  ScoutIntegrationRequestError,
} from '@/lib/scout-integration';
import { rejectCrossSiteMutation } from '@/lib/security';
import { getRequestUser, type RequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

function requireOwner(
  request: Request,
): { user: RequestUser; response: null } | { user: null; response: Response } {
  const user = getRequestUser(request);
  if (!user)
    return {
      user: null,
      response: scoutIntegrationJsonResponse(
        { error: 'Sign in with ChatGPT to manage integration credentials.' },
        { status: 401 },
      ),
    };
  if (!isCommunityAdmin(request, env.COMMUNITY_ADMIN_EMAIL))
    return {
      user: null,
      response: scoutIntegrationJsonResponse(
        { error: 'Only the app owner can manage integration credentials.' },
        { status: 403 },
      ),
    };
  return { user, response: null };
}

export async function GET(request: Request) {
  const owner = requireOwner(request);
  if (owner.response) return owner.response;
  try {
    return scoutIntegrationJsonResponse({
      data: await listScoutIntegrationCredentials(getD1(), owner.user),
    });
  } catch {
    return scoutIntegrationJsonResponse(
      { error: 'Could not list integration credentials.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const owner = requireOwner(request);
  if (owner.response) return owner.response;
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) {
    blocked.headers.set('cache-control', 'private, no-store');
    return blocked;
  }
  try {
    const parsed = createScoutIntegrationCredentialSchema.safeParse(
      await readBoundedJson(request, 8_192),
    );
    if (!parsed.success)
      return scoutIntegrationJsonResponse(
        {
          error: 'Invalid credential metadata.',
          issues: parsed.error.issues.slice(0, 8).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    const data = await createScoutIntegrationCredential(
      getD1(),
      owner.user,
      parsed.data,
    );
    return scoutIntegrationJsonResponse({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof ScoutIntegrationRequestError) {
      const message =
        error.code === 'payload_too_large'
          ? 'Credential request is too large.'
          : error.code === 'unsupported_media_type'
            ? 'Content-Type must be application/json.'
            : 'Invalid JSON body.';
      return scoutIntegrationJsonResponse(
        { error: message },
        { status: error.status },
      );
    }
    if (error instanceof ScoutIntegrationCredentialError) {
      const message =
        error.code === 'credential_limit'
          ? 'Revoke an unused Community Scout credential before creating another.'
          : error.code === 'invalid_expiry'
            ? 'Credential expiry must be in the future.'
            : 'Invalid credential metadata.';
      return scoutIntegrationJsonResponse(
        { error: message },
        { status: error.status },
      );
    }
    return scoutIntegrationJsonResponse(
      { error: 'Could not create the integration credential.' },
      { status: 500 },
    );
  }
}
