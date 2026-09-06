import {
  type AuthRequest,
  AuthorizationError,
  type CompleteAuthorizationOptions,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authenticateGitHubCode = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 56_995_940, login: 'Kennydebie' })),
);

vi.mock('../src/github-oauth', () => ({
  authenticateGitHubCode,
  githubAuthorizationUrl: (
    env: { GITHUB_CLIENT_ID: string },
    state: string,
  ) => {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    url.searchParams.set(
      'redirect_uri',
      'https://tcg-scout-mcp-bridge.kennydebie1.workers.dev/callback',
    );
    url.searchParams.set('state', state);
    url.searchParams.set('allow_signup', 'false');
    return url.href;
  },
}));

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

afterEach(() => {
  vi.unstubAllGlobals();
});

function createAuthorizationHarness() {
  const get = vi.fn(() => Promise.resolve(null));
  const put = vi.fn(() => Promise.resolve());
  const deleteFlow = vi.fn(() => Promise.resolve());
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
  const completeAuthorization = vi.fn(
    (options: CompleteAuthorizationOptions) => {
      const redirectTo = new URL(options.request.redirectUri);
      redirectTo.searchParams.set('code', 'chatgpt-code');
      redirectTo.searchParams.set('state', options.request.state);
      if (options.request.issuer) {
        redirectTo.searchParams.set('iss', options.request.issuer);
      }
      return Promise.resolve({ redirectTo: redirectTo.href });
    },
  );
  const env = {
    ...baseEnv,
    OAUTH_KV: { get, put, delete: deleteFlow },
    OAUTH_PROVIDER: {
      parseAuthRequest,
      lookupClient,
      completeAuthorization,
    } as unknown as OAuthHelpers,
  } as unknown as BridgeAuthEnv;

  return { completeAuthorization, deleteFlow, env, get, put };
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

  it('keeps the browser flow portable across Cloudflare locations without KV state', async () => {
    const { deleteFlow, env, get, put } = createAuthorizationHarness();
    const consent = await beginConsent(env);
    const firstResponse = await submitConsent(env, consent);
    expect(firstResponse.status).toBe(303);
    const repeatedResponse = await submitConsent(env, consent);

    expect(repeatedResponse.status).toBe(303);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(deleteFlow).not.toHaveBeenCalled();
  });

  it('completes the GitHub callback using only its signed browser session', async () => {
    const { completeAuthorization, env, get, put } =
      createAuthorizationHarness();
    const wait = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { wait });
    const consent = await beginConsent(env);
    const githubResponse = await submitConsent(env, consent);
    const githubLocation = new URL(
      githubResponse.headers.get('location') ?? '',
    );
    const state = githubLocation.searchParams.get('state');
    if (!state) throw new Error('Missing GitHub state.');

    const callbackResponse = await authHandler.fetch?.(
      new Request(
        `${GITHUB_CALLBACK_URL}?code=temporary-github-code&state=${encodeURIComponent(state)}`,
        {
          headers: { cookie: responseCookie(githubResponse) },
        },
      ),
      env,
      context,
    );

    expect(callbackResponse?.status).toBe(302);
    expect(callbackResponse?.headers.get('location')).toBe(
      `${clientRedirectUri}?code=chatgpt-code&state=chatgpt-state&iss=${encodeURIComponent(BRIDGE_ORIGIN)}`,
    );
    expect(authenticateGitHubCode).toHaveBeenCalledWith(
      env,
      'temporary-github-code',
    );
    expect(completeAuthorization).toHaveBeenCalledOnce();
    const completion = completeAuthorization.mock.calls[0]?.[0];
    expect(completion?.request.issuer).toBe(BRIDGE_ORIGIN);
    expect(completion?.userId).toBe('github-56995940');
    expect(wait).toHaveBeenCalledWith(1_500);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
