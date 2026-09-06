import { describe, expect, it, vi } from 'vitest';

import { GITHUB_CALLBACK_URL } from '../src/constants';
import type { BridgeEnv } from '../src/env';
import { authenticateGitHubCode } from '../src/github-oauth';
import type { SafeHttpError } from '../src/http';

const env = {
  GITHUB_CLIENT_ID: 'github-client-id',
  GITHUB_CLIENT_SECRET: 'S'.repeat(40),
} as BridgeEnv;

describe('GitHub OAuth exchange', () => {
  it('uses the documented form encoding and returns the verified identity', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'github-access-token-value',
            token_type: 'bearer',
            scope: '',
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 56_995_940, login: 'Kennydebie' }), {
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(
      authenticateGitHubCode(env, 'temporary-code', fetchImplementation),
    ).resolves.toEqual({ id: 56_995_940, login: 'Kennydebie' });

    const tokenRequest = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(tokenRequest.headers).toEqual(
      expect.objectContaining({
        'content-type': 'application/x-www-form-urlencoded',
      }),
    );
    if (typeof tokenRequest.body !== 'string') {
      throw new Error('Expected form-encoded token request body.');
    }
    expect(new URLSearchParams(tokenRequest.body)).toEqual(
      new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: 'temporary-code',
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    );
  });

  it('classifies GitHub credential rejection without exposing its response text', async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'incorrect_client_credentials',
            error_description: 'sensitive upstream detail',
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      authenticateGitHubCode(env, 'temporary-code', fetchImplementation),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SafeHttpError>>({
        code: 'github_token_exchange_incorrect_client_credentials',
      }),
    );
  });
});
