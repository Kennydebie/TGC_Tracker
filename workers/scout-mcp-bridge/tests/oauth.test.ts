import {
  type AuthRequest,
  AuthorizationError,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { describe, expect, it, vi } from 'vitest';

import { authHandler } from '../src/auth-handler';
import {
  BRIDGE_ORIGIN,
  GITHUB_CALLBACK_URL,
  GITHUB_ORIGIN,
  MCP_RESOURCE,
  SCOUT_SCOPES,
} from '../src/constants';
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

const clientRedirectUri = 'https://chatgpt.com/connectors/oauth/callback';

function createAuthorizationHarness() {
  const store = new Map<string, string>();
  const get = vi.fn((key: string) => Promise.resolve(store.get(key) ?? null));
  const put = vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  });
  const deleteFlow = vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  });
  const authRequest: AuthRequest = {
    responseType: 'code',
    clientId: 'chatgpt-client',
    redirectUri: clientRedirectUri,
    scope: [...SCOUT_SCOPES],
    state: 'chatgpt-state',
    codeChallenge: 'C'.repeat(43),
    codeChallengeMethod: 'S256',
    resource: MCP_RESOURCE,
    issuer: BRIDGE_ORIGIN,
  };
  const parseAuthRequest = vi.fn(() => Promise.resolve(authRequest));
  const lookupClient = vi.fn(() =>
    Promise.resolve({
      clientId: authRequest.clientId,
      redirectUris: [authRequest.redirectUri],
      clientName: 'ChatGPT',
    }),
  );
  const env = {
    ...baseEnv,
    OAUTH_KV: { get, put, delete: deleteFlow },
    OAUTH_PROVIDER: {
      parseAuthRequest,
      lookupClient,
    } as unknown as OAuthHelpers,
  } as unknown as BridgeAuthEnv;

  return { deleteFlow, env, put, store };
}

function hiddenInput(html: string, name: string): string {
  const match = new RegExp(`name="${name}" value="([^"]+)"`, 'u').exec(html);
  if (!match?.[1]) throw new Error(`Missing ${name} input.`);
  return match[1];
}

function responseCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Missing authorization cookie.');
  return cookie;
}

async function beginConsent(env: BridgeAuthEnv) {
  const response = await authHandler.fetch?.(
    new Request(`${BRIDGE_ORIGIN}/authorize`),
    env,
    context,
  );
  if (!response) throw new Error('Authorization handler did not respond.');
  const html = await response.text();
  return {
    cookie: responseCookie(response),
    flowId: hiddenInput(html, 'flow_id'),
    nonce: hiddenInput(html, 'csrf'),
    response,
  };
}

async function submitConsent(
  env: BridgeAuthEnv,
  consent: Awaited<ReturnType<typeof beginConsent>>,
): Promise<Response> {
  const response = await authHandler.fetch?.(
    new Request(`${BRIDGE_ORIGIN}/authorize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: consent.cookie,
      },
      body: new URLSearchParams({
        flow_id: consent.flowId,
        csrf: consent.nonce,
        decision: 'approve',
      }),
    }),
    env,
    context,
  );
  if (!response) throw new Error('Authorization handler did not respond.');
  return response;
}

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

describe('authorization consent navigation', () => {
  it('allows only the fixed GitHub and validated client origins beyond self', async () => {
    const { env } = createAuthorizationHarness();
    const { response } = await beginConsent(env);
    const policy = response.headers.get('content-security-policy');
    const formAction = policy
      ?.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('form-action '));

    expect(policy).toContain("default-src 'none'");
    expect(formAction).toBe(
      `form-action 'self' ${GITHUB_ORIGIN} ${new URL(clientRedirectUri).origin}`,
    );
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it('uses See Other for successful POST-to-GitHub navigation', async () => {
    const { env } = createAuthorizationHarness();
    const consent = await beginConsent(env);
    const response = await submitConsent(env, consent);

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe(GITHUB_ORIGIN);
    expect(location.pathname).toBe('/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('github-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(GITHUB_CALLBACK_URL);
    expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(response.headers.get('set-cookie')).toMatch(
      /^__Host-tcg_scout_github=.*; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/u,
    );
  });

  it('does not delete the GitHub phase on a stale repeated consent POST', async () => {
    const { deleteFlow, env, put, store } = createAuthorizationHarness();
    const consent = await beginConsent(env);
    const firstResponse = await submitConsent(env, consent);
    expect(firstResponse.status).toBe(303);

    const githubKey = [...store.keys()].find((key) =>
      key.startsWith('bridge:oauth-flow:github:'),
    );
    if (!githubKey) throw new Error('Missing GitHub authorization flow.');
    const githubFlow = store.get(githubKey);
    expect(JSON.parse(githubFlow ?? '{}')).toMatchObject({ phase: 'github' });
    const phaseWriteKeys = put.mock.calls.map(([key]) => key);
    expect(phaseWriteKeys).toEqual([
      `bridge:oauth-flow:consent:${consent.flowId}`,
      `bridge:oauth-flow:github:${consent.flowId}`,
    ]);

    deleteFlow.mockClear();
    const repeatedResponse = await submitConsent(env, consent);

    expect(repeatedResponse.status).toBe(400);
    expect(deleteFlow).not.toHaveBeenCalled();
    expect(store.get(githubKey)).toBe(githubFlow);
  });
});
