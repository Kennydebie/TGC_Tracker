import { describe, expect, it } from 'vitest';

import { getScoutIngestionState, saveScoutFindings } from '../src/downstream';
import type { DownstreamError } from '../src/downstream';
import type { BridgeEnv } from '../src/env';
import type { SaveFindingsInput } from '../src/schemas';

const env = {
  TCG_SCOUT_BASE_URL:
    'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site',
  ALLOWED_GITHUB_USER_ID: '56995940',
  TCG_SCOUT_INTEGRATION_TOKEN: `tcs_int_${'A'.repeat(20)}.${'B'.repeat(43)}`,
} as BridgeEnv;

const state = {
  collectionMethod: 'chatgpt_web_research',
  trackedSources: [],
  lastSuccessfulImportAt: null,
  lastAttemptAt: null,
  lastRunStatus: null,
  actionableError: null,
  recentRuns: [],
  recentFindings: [],
} as const;

const findingsInput: SaveFindingsInput = {
  run: {
    id: 'test-run',
    startedAt: '2026-09-06T10:00:00.000Z',
    finishedAt: '2026-09-06T10:01:00.000Z',
    sourceChecks: [
      {
        sourceIdentifier: 'reddit:r/example',
        status: 'checked',
        checkedAt: '2026-09-06T10:00:30.000Z',
        coverageThrough: null,
        errorCode: null,
        detail: null,
      },
    ],
  },
  findings: [],
};

describe('fixed downstream API calls', () => {
  it('uses only the state path, bounded query, subject, and bearer secret', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const mockFetch: typeof fetch = (input, init) => {
      calls.push([input, init]);
      return Promise.resolve(Response.json({ data: state }, { status: 200 }));
    };
    await expect(
      getScoutIngestionState(
        env,
        '56995940',
        { recentRunLimit: 8, recentFindingLimit: 40 },
        mockFetch,
      ),
    ).resolves.toEqual(state);

    const [url, init] = calls[0] ?? [];
    expect(url).toBe(
      'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site/api/integrations/scout-mcp/state?recentRunLimit=8&recentFindingLimit=40',
    );
    expect(init?.redirect).toBe('manual');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-tcg-scout-oauth-subject')).toBe('github:56995940');
    expect(headers.get('authorization')).toBe(
      `Bearer ${env.TCG_SCOUT_INTEGRATION_TOKEN}`,
    );
  });

  it('uses only the findings path and preserves an actionable 409 result', async () => {
    const result = {
      runId: 'test-run',
      status: 'failed',
      replayed: false,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      rejected: 0,
      recordIds: [],
      errors: [
        {
          index: null,
          code: 'run_id_conflict',
          path: 'run.id',
          message: 'Use a new run ID.',
        },
      ],
    } as const;
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const mockFetch: typeof fetch = (input, init) => {
      calls.push([input, init]);
      return Promise.resolve(Response.json({ data: result }, { status: 409 }));
    };
    await expect(
      saveScoutFindings(env, '56995940', findingsInput, mockFetch),
    ).resolves.toEqual(result);
    const [url, init] = calls[0] ?? [];
    expect(url).toBe(
      'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site/api/integrations/scout-mcp/findings',
    );
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
  });

  it('rejects unbounded or malformed responses without exposing their bodies', async () => {
    const mockFetch: typeof fetch = async () =>
      Promise.resolve(
        new Response('not json', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      );
    await expect(
      getScoutIngestionState(
        env,
        '56995940',
        { recentRunLimit: 8, recentFindingLimit: 40 },
        mockFetch,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DownstreamError>>({
        code: 'invalid_response_content_type',
      }),
    );
  });
});
