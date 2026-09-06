import { z } from 'zod';

import {
  DOWNSTREAM_TIMEOUT_MS,
  GITHUB_CALLBACK_URL,
  GITHUB_MAX_BODY_BYTES,
  GITHUB_ORIGIN,
} from './constants';
import type { BridgeEnv } from './env';
import { readBoundedJson, SafeHttpError } from './http';
import type { FetchImplementation } from './downstream';

const GITHUB_AUTHORIZE_URL = `${GITHUB_ORIGIN}/login/oauth/authorize`;
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

const tokenSchema = z
  .object({
    access_token: z.string().min(20).max(1_000),
    token_type: z.string().toLowerCase().pipe(z.literal('bearer')),
    scope: z.string().max(1_000).optional(),
  })
  .passthrough();

const tokenErrorSchema = z
  .object({
    error: z.string().min(1).max(100),
  })
  .passthrough();

const safeTokenErrorCodes = new Set([
  'bad_verification_code',
  'incorrect_client_credentials',
  'redirect_uri_mismatch',
  'unverified_user_email',
]);

const githubUserSchema = z
  .object({
    id: z.number().int().positive().safe(),
    login: z.string().min(1).max(100),
  })
  .passthrough();

export type GitHubUser = z.infer<typeof githubUserSchema>;

export function githubAuthorizationUrl(env: BridgeEnv, state: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', GITHUB_CALLBACK_URL);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  return url.href;
}

async function githubFetch(
  fetchImplementation: FetchImplementation,
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(DOWNSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new SafeHttpError('github_unavailable', 502);
  }
}

export async function authenticateGitHubCode(
  env: BridgeEnv,
  code: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<GitHubUser> {
  const tokenResponse = await githubFetch(
    fetchImplementation,
    GITHUB_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'tcg-scout-mcp-bridge',
      },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }).toString(),
    },
  );
  if (tokenResponse.status !== 200) {
    throw new SafeHttpError('github_token_exchange_http_error', 502);
  }
  const tokenValue = await readBoundedJson(
    tokenResponse,
    GITHUB_MAX_BODY_BYTES,
    z.unknown(),
  );
  const parsedToken = tokenSchema.safeParse(tokenValue);
  if (!parsedToken.success) {
    const parsedError = tokenErrorSchema.safeParse(tokenValue);
    if (!parsedError.success) {
      throw new SafeHttpError('invalid_response_schema', 502);
    }
    const errorCode = safeTokenErrorCodes.has(parsedError.data.error)
      ? parsedError.data.error
      : 'rejected';
    throw new SafeHttpError(`github_token_exchange_${errorCode}`, 502);
  }
  const token = parsedToken.data;

  const userResponse = await githubFetch(fetchImplementation, GITHUB_USER_URL, {
    method: 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token.access_token}`,
      'user-agent': 'tcg-scout-mcp-bridge',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (userResponse.status !== 200) {
    throw new SafeHttpError('github_identity_failed', 502);
  }
  return readBoundedJson(userResponse, GITHUB_MAX_BODY_BYTES, githubUserSchema);
}
