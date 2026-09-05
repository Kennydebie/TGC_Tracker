import {
  AuthorizationError,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { describe, expect, it, vi } from 'vitest';

import { authHandler } from '../src/auth-handler';
import { BRIDGE_ORIGIN, MCP_RESOURCE, SCOUT_SCOPES } from '../src/constants';
import type { BridgeAuthEnv } from '../src/env';
import { oauthProvider } from '../src/index';

const context = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

const baseEnv = {
  OAUTH_KV: {
    get: vi.fn(() => Promise.resolve(null)),
    put: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  },
  TCG_SCOUT_BASE_URL:
    'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site',
  ALLOWED_GITHUB_USER_ID: '56995940',
  GITHUB_CLIENT_ID: 'github-client-id',
  GITHUB_CLIENT_SECRET: 'S'.repeat(40),
  COOKIE_ENCRYPTION_KEY: 'K'.repeat(43),
  TCG_SCOUT_INTEGRATION_TOKEN: `tcs_int_${'A'.repeat(20)}.${'B'.repeat(43)}`,
} as unknown as BridgeAuthEnv;

describe('OAuth discovery and challenge', () => {
  it('advertises S256 only and the exact scopes and endpoints', async () => {
    const response = await oauthProvider.fetch(
      new Request(`${BRIDGE_ORIGIN}/.well-known/oauth-authorization-server`),
      baseEnv,
      context,
    );
    const metadata = await response.json<Record<string, unknown>>();
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.scopes_supported).toEqual([...SCOUT_SCOPES]);
    expect(metadata.authorization_endpoint).toBe(`${BRIDGE_ORIGIN}/authorize`);
    expect(metadata.token_endpoint).toBe(`${BRIDGE_ORIGIN}/oauth/token`);
    expect(metadata.registration_endpoint).toBe(
      `${BRIDGE_ORIGIN}/oauth/register`,
    );
  });

  it('publishes the exact protected resource audience', async () => {
    const response = await oauthProvider.fetch(
      new Request(`${BRIDGE_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      baseEnv,
      context,
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        resource: MCP_RESOURCE,
        authorization_servers: [BRIDGE_ORIGIN],
        scopes_supported: [...SCOUT_SCOPES],
        bearer_methods_supported: ['header'],
      }),
    );
  });

  it('returns an OAuth resource challenge before the MCP handler', async () => {
    const response = await oauthProvider.fetch(
      new Request(MCP_RESOURCE, { method: 'POST' }),
      baseEnv,
      context,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      `${BRIDGE_ORIGIN}/.well-known/oauth-protected-resource/mcp`,
    );
  });
});

describe('authorization redirect trust', () => {
  it('delegates redirect validation to parseAuthRequest and never redirects an unvalidated URI', async () => {
    const parseAuthRequest = vi.fn(() =>
      Promise.reject(
        new AuthorizationError('invalid_request', {
          description: 'Invalid redirect URI.',
        }),
      ),
    );
    const env = {
      ...baseEnv,
      OAUTH_PROVIDER: { parseAuthRequest } as unknown as OAuthHelpers,
    };
    const response = await authHandler.fetch?.(
      new Request(
        `${BRIDGE_ORIGIN}/authorize?redirect_uri=https%3A%2F%2Fevil.example`,
      ),
      env,
      context,
    );
    expect(parseAuthRequest).toHaveBeenCalledOnce();
    expect(response?.status).toBe(400);
    expect(response?.headers.get('location')).toBeNull();
  });
});
