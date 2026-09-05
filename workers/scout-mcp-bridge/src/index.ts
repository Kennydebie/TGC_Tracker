import OAuthProvider from '@cloudflare/workers-oauth-provider';

import { authHandler } from './auth-handler';
import {
  BRIDGE_ORIGIN,
  MCP_PATH,
  MCP_RESOURCE,
  SCOUT_SCOPES,
} from './constants';
import type { BridgeAuthEnv } from './env';
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

export default oauthProvider;
