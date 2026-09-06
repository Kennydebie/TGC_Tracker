import {
  AuthorizationError,
  type AuthRequest,
} from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';

import {
  AUTH_FLOW_TTL_SECONDS,
  AUTH_MAX_BODY_BYTES,
  BRIDGE_ORIGIN,
  GITHUB_CALLBACK_URL,
  GITHUB_ORIGIN,
  MCP_RESOURCE,
  SCOUT_SCOPES,
} from './constants';
import {
  clearCookie,
  randomBase64Url,
  readCookie,
  secureCookie,
  signedFlowCookieSchema,
  signValue,
  verifySignedValue,
} from './auth-security';
import { parseBridgeEnv, type BridgeAuthEnv } from './env';
import { authenticateGitHubCode, githubAuthorizationUrl } from './github-oauth';
import { readBoundedForm, SafeHttpError } from './http';

const CONSENT_COOKIE = '__Host-tcg_scout_consent';
const GITHUB_COOKIE = '__Host-tcg_scout_github';
const FLOW_KEY_PREFIX = 'bridge:oauth-flow:';

const authRequestSchema = z
  .object({
    responseType: z.literal('code'),
    clientId: z.string().min(1).max(2_048),
    redirectUri: z.string().url().max(2_048),
    scope: z.array(z.enum(SCOUT_SCOPES)).min(1).max(SCOUT_SCOPES.length),
    state: z.string().max(2_048),
    codeChallenge: z.string().min(43).max(128),
    codeChallengeMethod: z.literal('S256'),
    resource: z
      .union([z.literal(MCP_RESOURCE), z.array(z.literal(MCP_RESOURCE)).min(1)])
      .optional(),
    issuer: z.string().url().max(2_048).optional(),
  })
  .strict();

type StoredFlow = {
  phase: 'consent' | 'github';
  request: AuthRequest;
  clientName: string;
  nonce: string;
};

const storedFlowSchema: z.ZodType<StoredFlow> = z
  .object({
    phase: z.enum(['consent', 'github']),
    request: z.custom<AuthRequest>(
      (value) => authRequestSchema.safeParse(value).success,
      'Invalid stored authorization request.',
    ),
    clientName: z.string().min(1).max(120),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

function securityHeaders(
  contentType = 'text/plain; charset=utf-8',
  formAction = "'self'",
): Headers {
  return new Headers({
    'cache-control': 'no-store',
    'content-security-policy': `default-src 'none'; base-uri 'none'; form-action ${formAction}; frame-ancestors 'none'`,
    'content-type': contentType,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}

function localError(status: number, message: string): Response {
  return new Response(message, { status, headers: securityHeaders() });
}

function redirect(
  location: string,
  cookie?: string,
  status: 302 | 303 = 302,
): Response {
  const headers = securityHeaders();
  headers.set('location', location);
  if (cookie) headers.set('set-cookie', cookie);
  return new Response(null, { status, headers });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? '';
  });
}

function oauthErrorRedirect(
  request: AuthRequest,
  code: 'access_denied' | 'server_error',
  description: string,
  cookie?: string,
): Response {
  const location = new URL(request.redirectUri);
  location.searchParams.set('error', code);
  location.searchParams.set('error_description', description);
  location.searchParams.set('state', request.state);
  if (request.issuer) location.searchParams.set('iss', request.issuer);
  return redirect(location.href, cookie);
}

function normalizeClientName(value: string | undefined): string {
  const normalized = value
    ? [...value]
        .filter((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint >= 32 && codePoint !== 127;
        })
        .join('')
        .trim()
    : undefined;
  return normalized ? normalized.slice(0, 120) : 'ChatGPT';
}

async function putFlow(
  env: BridgeAuthEnv,
  flowId: string,
  flow: StoredFlow,
): Promise<void> {
  await env.OAUTH_KV.put(
    `${FLOW_KEY_PREFIX}${flow.phase}:${flowId}`,
    JSON.stringify(flow),
    {
      expirationTtl: AUTH_FLOW_TTL_SECONDS,
    },
  );
}

async function consumeFlow(
  env: BridgeAuthEnv,
  flowId: string,
  phase: StoredFlow['phase'],
): Promise<StoredFlow | null> {
  const key = `${FLOW_KEY_PREFIX}${phase}:${flowId}`;
  const raw = await env.OAUTH_KV.get(key);
  if (!raw) return null;
  let flow: StoredFlow;
  try {
    flow = storedFlowSchema.parse(JSON.parse(raw));
  } catch {
    await env.OAUTH_KV.delete(key);
    return null;
  }
  if (flow.phase !== phase) return null;
  await env.OAUTH_KV.delete(key);
  return flow;
}

async function startAuthorization(
  request: Request,
  env: BridgeAuthEnv,
): Promise<Response> {
  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    if (!error.redirectUri)
      return localError(400, 'Invalid authorization request.');
    const location = new URL(error.redirectUri);
    location.searchParams.set('error', error.code);
    location.searchParams.set(
      'error_description',
      'Invalid authorization request.',
    );
    if (error.state) location.searchParams.set('state', error.state);
    if (error.issuer) location.searchParams.set('iss', error.issuer);
    return redirect(location.href);
  }

  const parsed = authRequestSchema.safeParse(authRequest);
  if (!parsed.success)
    return localError(
      400,
      'S256 PKCE and a valid TCG Scout scope are required.',
    );

  const client = await env.OAUTH_PROVIDER.lookupClient(parsed.data.clientId);
  if (!client) return localError(400, 'Unknown OAuth client.');

  const flowId = randomBase64Url();
  const nonce = randomBase64Url();
  const clientName = normalizeClientName(client.clientName);
  await putFlow(env, flowId, {
    phase: 'consent',
    request: authRequest,
    clientName,
    nonce,
  });
  const cookie = await signValue(
    {
      kind: 'consent',
      flowId,
      nonce,
      expiresAt: Date.now() + AUTH_FLOW_TTL_SECONDS * 1_000,
    },
    env.COOKIE_ENCRYPTION_KEY,
  );

  const scopes = parsed.data.scope.map(escapeHtml).join(', ');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize TCG Scout</title></head>
<body><main><h1>Authorize TCG Scout</h1><p><strong>${escapeHtml(clientName)}</strong> is requesting: ${scopes}.</p>
<p>You will sign in with GitHub. Only GitHub account 56995940 is allowed.</p>
<form method="post" action="/authorize"><input type="hidden" name="flow_id" value="${flowId}"><input type="hidden" name="csrf" value="${nonce}">
<button type="submit" name="decision" value="approve">Continue with GitHub</button><button type="submit" name="decision" value="deny">Deny</button></form></main></body></html>`;
  const headers = securityHeaders(
    'text/html; charset=utf-8',
    `'self' ${GITHUB_ORIGIN} ${new URL(parsed.data.redirectUri).origin}`,
  );
  headers.set('set-cookie', secureCookie(CONSENT_COOKIE, cookie));
  return new Response(html, { status: 200, headers });
}

async function submitConsent(
  request: Request,
  env: BridgeAuthEnv,
): Promise<Response> {
  const form = await readBoundedForm(request, AUTH_MAX_BODY_BYTES);
  const flowId = form.get('flow_id') ?? '';
  const nonce = form.get('csrf') ?? '';
  const decision = form.get('decision');
  const cookie = await verifySignedValue(
    readCookie(request, CONSENT_COOKIE),
    env.COOKIE_ENCRYPTION_KEY,
    signedFlowCookieSchema,
  );
  if (
    !cookie ||
    cookie.kind !== 'consent' ||
    cookie.flowId !== flowId ||
    cookie.nonce !== nonce
  ) {
    return localError(400, 'Authorization flow is invalid or expired.');
  }

  const flow = await consumeFlow(env, flowId, 'consent');
  if (!flow || flow.nonce !== nonce) {
    return localError(400, 'Authorization flow is invalid or expired.');
  }
  if (decision === 'deny') {
    return oauthErrorRedirect(
      flow.request,
      'access_denied',
      'The resource owner denied access.',
      clearCookie(CONSENT_COOKIE),
    );
  }
  if (decision !== 'approve')
    return localError(400, 'Invalid consent decision.');

  const githubState = randomBase64Url();
  await putFlow(env, flowId, {
    ...flow,
    phase: 'github',
    nonce: githubState,
  });
  const githubCookie = await signValue(
    {
      kind: 'github',
      flowId,
      nonce: githubState,
      expiresAt: Date.now() + AUTH_FLOW_TTL_SECONDS * 1_000,
    },
    env.COOKIE_ENCRYPTION_KEY,
  );
  return redirect(
    githubAuthorizationUrl(env, githubState),
    secureCookie(GITHUB_COOKIE, githubCookie),
    303,
  );
}

async function finishGitHubAuthorization(
  request: Request,
  env: BridgeAuthEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const cookie = await verifySignedValue(
    readCookie(request, GITHUB_COOKIE),
    env.COOKIE_ENCRYPTION_KEY,
    signedFlowCookieSchema,
  );
  if (!cookie || cookie.kind !== 'github' || cookie.nonce !== state) {
    return localError(400, 'Authorization flow is invalid or expired.');
  }
  const flow = await consumeFlow(env, cookie.flowId, 'github');
  if (!flow || flow.nonce !== state) {
    return localError(400, 'Authorization flow is invalid or expired.');
  }

  if (url.searchParams.has('error')) {
    return oauthErrorRedirect(
      flow.request,
      'access_denied',
      'GitHub authorization was not completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }
  const code = url.searchParams.get('code');
  if (!code || code.length > 1_000) {
    return oauthErrorRedirect(
      flow.request,
      'server_error',
      'GitHub authorization could not be completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }

  try {
    const githubUser = await authenticateGitHubCode(env, code);
    const githubUserId = String(githubUser.id);
    if (githubUserId !== env.ALLOWED_GITHUB_USER_ID) {
      return oauthErrorRedirect(
        flow.request,
        'access_denied',
        'This GitHub account is not permitted.',
        clearCookie(GITHUB_COOKIE),
      );
    }

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: flow.request,
      userId: `github-${githubUserId}`,
      metadata: { provider: 'github', clientName: flow.clientName },
      scope: flow.request.scope,
      props: {
        provider: 'github',
        subject: `github:${githubUserId}`,
        githubUserId,
        githubLogin: githubUser.login,
      },
      revokeExistingGrants: true,
    });
    return redirect(redirectTo, clearCookie(GITHUB_COOKIE));
  } catch {
    return oauthErrorRedirect(
      flow.request,
      'server_error',
      'GitHub authorization could not be completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }
}

export const authHandler: ExportedHandler<BridgeAuthEnv> = {
  async fetch(request, unsafeEnv) {
    const url = new URL(request.url);
    if (url.origin !== BRIDGE_ORIGIN)
      return localError(400, 'Invalid request host.');
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          service: 'TCG Scout MCP bridge',
          mcp: MCP_RESOURCE,
          githubCallback: GITHUB_CALLBACK_URL,
        }),
        {
          status: 200,
          headers: securityHeaders('application/json; charset=utf-8'),
        },
      );
    }

    let env: BridgeAuthEnv;
    try {
      env = parseBridgeEnv(unsafeEnv) as BridgeAuthEnv;
    } catch {
      return localError(503, 'Service configuration is incomplete.');
    }

    try {
      if (url.pathname === '/authorize' && request.method === 'GET') {
        return await startAuthorization(request, env);
      }
      if (url.pathname === '/authorize' && request.method === 'POST') {
        return await submitConsent(request, env);
      }
      if (url.pathname === '/callback' && request.method === 'GET') {
        return await finishGitHubAuthorization(request, env);
      }
      return localError(404, 'Not found.');
    } catch (error) {
      if (error instanceof SafeHttpError) {
        return localError(
          error.status,
          'Authorization request could not be completed.',
        );
      }
      return localError(500, 'Authorization request could not be completed.');
    }
  },
};
