import OAuthProvider from '@cloudflare/workers-oauth-provider';

import { authHandler } from './auth-handler';
import {
  BRIDGE_ORIGIN,
  MCP_PATH,
  MCP_RESOURCE,
  SCOUT_SCOPES,
} from './constants';
import type { BridgeAuthEnv, BridgeEnv } from './env';
import { mcpApiHandler } from './mcp';

export const oauthProvider = new OAuthProvider<BridgeAuthEnv>({
  apiRoute: MCP_PATH,
  apiHandler: mcpApiHandler,
  defaultHandler: authHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: [...SCOUT_SCOPES],
  allowPlainPKCE: false,
  allowImplicitFlow: false,
  allowTokenExchangeGrant: false,
  disallowPublicClientRegistration: false,
  clientIdMetadataDocumentEnabled: true,
  resourceMatchOriginOnly: false,
  resourceMetadata: {
    resource: MCP_RESOURCE,
    authorization_servers: [BRIDGE_ORIGIN],
    scopes_supported: [...SCOUT_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'TCG Scout Community Radar',
  },
});

const safeOAuthErrors = new Set([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'invalid_target',
  'temporarily_unavailable',
  'unsupported_grant_type',
]);

async function tokenOutcome(response: Response): Promise<string> {
  if (response.ok) return 'success';
  try {
    const body = await response.clone().json<{ error?: unknown }>();
    if (typeof body.error === 'string' && safeOAuthErrors.has(body.error)) {
      return body.error;
    }
  } catch {
    // The response itself is returned unchanged; this is diagnostic only.
  }
  return 'failed';
}

const bridgeWorker: ExportedHandler<BridgeEnv> = {
  async fetch(request, env, context) {
    const response = await oauthProvider.fetch(
      request,
      env as BridgeAuthEnv,
      context,
    );
    if (
      new URL(request.url).pathname === '/oauth/token' &&
      request.method === 'POST'
    ) {
      console.info(
        JSON.stringify({
          component: 'tcg-scout-oauth',
          event: 'chatgpt_token_exchange',
          outcome: await tokenOutcome(response),
          status: response.status,
        }),
      );
    }
    return response;
  },
};

export default bridgeWorker;
