import {
  AuthorizationError,
  type AuthRequest,
} from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';

import {
  AUTH_COOKIE_MAX_BYTES,
  AUTH_FLOW_TTL_SECONDS,
  AUTH_MAX_BODY_BYTES,
  BRIDGE_ORIGIN,
  GITHUB_CALLBACK_URL,
  GITHUB_ORIGIN,
  MCP_RESOURCE,
  OAUTH_GRANT_PROPAGATION_DELAY_MS,
  SCOUT_SCOPES,
} from './constants';
import {
  clearCookie,
  randomBase64Url,
  readCookie,
  secureCookie,
  signValue,
  verifySignedValue,
} from './auth-security';
import { parseBridgeEnv, type BridgeAuthEnv } from './env';
import { authenticateGitHubCode, githubAuthorizationUrl } from './github-oauth';
import { readBoundedForm, SafeHttpError } from './http';

const CONSENT_COOKIE = '__Host-tcg_scout_consent';
const GITHUB_COOKIE = '__Host-tcg_scout_github';

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

const sessionShape = {
  request: z.custom<AuthRequest>(
    (value) => authRequestSchema.safeParse(value).success,
    'Invalid stored authorization request.',
  ),
  clientName: z.string().min(1).max(120),
  expiresAt: z.number().int().positive(),
};

const consentSessionSchema = z
  .object({
    ...sessionShape,
    kind: z.literal('consent'),
    flowId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .refine((value) => value.expiresAt >= Date.now(), 'Session expired.');

const githubSessionSchema = z
  .object({
    ...sessionShape,
    kind: z.literal('github'),
    state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .refine((value) => value.expiresAt >= Date.now(), 'Session expired.');

function safeErrorCode(error: unknown): string {
  if (error instanceof SafeHttpError) return error.code;
  if (error instanceof AuthorizationError) return `oauth_${error.code}`;
  return 'unexpected_error';
}

function logOAuthFailure(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      component: 'tcg-scout-oauth',
      event,
      reason: safeErrorCode(error),
    }),
  );
}

function checkedCookie(name: string, value: string): string {
  const cookie = secureCookie(name, value);
  if (new TextEncoder().encode(cookie).byteLength > AUTH_COOKIE_MAX_BYTES) {
    throw new SafeHttpError('authorization_session_too_large', 400);
  }
  return cookie;
}

async function waitForGrantVisibility(): Promise<void> {
  if (typeof scheduler !== 'undefined') {
    await scheduler.wait(OAUTH_GRANT_PROPAGATION_DELAY_MS);
  }
}

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
  const csrf = randomBase64Url();
  const clientName = normalizeClientName(client.clientName);
  const cookie = await signValue(
    {
      kind: 'consent',
      flowId,
      csrf,
      request: authRequest,
      clientName,
      expiresAt: Date.now() + AUTH_FLOW_TTL_SECONDS * 1_000,
    },
    env.COOKIE_ENCRYPTION_KEY,
  );

  const scopes = parsed.data.scope.map(escapeHtml).join(', ');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize TCG Scout</title></head>
<body><main><h1>Authorize TCG Scout</h1><p><strong>${escapeHtml(clientName)}</strong> is requesting: ${scopes}.</p>
<p>You will sign in with GitHub. Only GitHub account 56995940 is allowed.</p>
<form method="post" action="/authorize"><input type="hidden" name="flow_id" value="${flowId}"><input type="hidden" name="csrf" value="${csrf}">
<button type="submit" name="decision" value="approve">Continue with GitHub</button><button type="submit" name="decision" value="deny">Deny</button></form></main></body></html>`;
  const headers = securityHeaders(
    'text/html; charset=utf-8',
    `'self' ${GITHUB_ORIGIN} ${new URL(parsed.data.redirectUri).origin}`,
  );
  headers.set('set-cookie', checkedCookie(CONSENT_COOKIE, cookie));
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
    consentSessionSchema,
  );
  if (
    !cookie ||
    cookie.kind !== 'consent' ||
    cookie.flowId !== flowId ||
    cookie.csrf !== nonce
  ) {
    return localError(400, 'Authorization flow is invalid or expired.');
  }
  if (decision === 'deny') {
    return oauthErrorRedirect(
      cookie.request,
      'access_denied',
      'The resource owner denied access.',
      clearCookie(CONSENT_COOKIE),
    );
  }
  if (decision !== 'approve')
    return localError(400, 'Invalid consent decision.');

  const githubState = randomBase64Url();
  const githubCookie = await signValue(
    {
      kind: 'github',
      state: githubState,
      request: cookie.request,
      clientName: cookie.clientName,
      expiresAt: Date.now() + AUTH_FLOW_TTL_SECONDS * 1_000,
    },
    env.COOKIE_ENCRYPTION_KEY,
  );
  return redirect(
    githubAuthorizationUrl(env, githubState),
    checkedCookie(GITHUB_COOKIE, githubCookie),
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
    githubSessionSchema,
  );
  if (!cookie || cookie.kind !== 'github' || cookie.state !== state) {
    logOAuthFailure(
      'github_callback_state_rejected',
      new SafeHttpError('invalid_or_expired_session', 400),
    );
    return localError(400, 'Authorization flow is invalid or expired.');
  }

  if (url.searchParams.has('error')) {
    return oauthErrorRedirect(
      cookie.request,
      'access_denied',
      'GitHub authorization was not completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }
  const code = url.searchParams.get('code');
  if (!code || code.length > 1_000) {
    return oauthErrorRedirect(
      cookie.request,
      'server_error',
      'GitHub authorization could not be completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }

  let githubUser: Awaited<ReturnType<typeof authenticateGitHubCode>>;
  try {
    githubUser = await authenticateGitHubCode(env, code);
  } catch (error) {
    logOAuthFailure('github_token_or_identity_failed', error);
    return oauthErrorRedirect(
      cookie.request,
      'server_error',
      'GitHub authorization could not be completed.',
      clearCookie(GITHUB_COOKIE),
    );
  }

  const githubUserId = String(githubUser.id);
  if (githubUserId !== env.ALLOWED_GITHUB_USER_ID) {
    logOAuthFailure(
      'github_account_rejected',
      new SafeHttpError('github_account_not_allowed', 403),
    );
    return oauthErrorRedirect(
      cookie.request,
      'access_denied',
      'This GitHub account is not permitted.',
      clearCookie(GITHUB_COOKIE),
    );
  }

  try {
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: cookie.request,
      userId: `github-${githubUserId}`,
      metadata: { provider: 'github', clientName: cookie.clientName },
      scope: cookie.request.scope,
      props: {
        provider: 'github',
        subject: `github:${githubUserId}`,
        githubUserId,
        githubLogin: githubUser.login,
      },
      revokeExistingGrants: true,
    });
    await waitForGrantVisibility();
    console.info(
      JSON.stringify({
        component: 'tcg-scout-oauth',
        event: 'authorization_code_issued',
      }),
    );
    return redirect(redirectTo, clearCookie(GITHUB_COOKIE));
  } catch (error) {
    logOAuthFailure('authorization_code_issue_failed', error);
    return oauthErrorRedirect(
      cookie.request,
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
        logOAuthFailure('authorization_route_failed', error);
        return localError(
          error.status,
          'Authorization request could not be completed.',
        );
      }
      logOAuthFailure('authorization_route_failed', error);
      return localError(500, 'Authorization request could not be completed.');
    }
  },
};
