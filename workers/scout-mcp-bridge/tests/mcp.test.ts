import type {
  CallToolResult,
  McpRequestContext,
} from '@modelcontextprotocol/server';
import type { TokenSummary } from '@cloudflare/workers-oauth-provider';
import { describe, expect, it, vi } from 'vitest';

import { BRIDGE_ORIGIN, MCP_RESOURCE, TOOL_NAMES } from '../src/constants';
import type { BridgeEnv } from '../src/env';
import {
  createScoutMcpServer,
  mcpApiHandler,
  resolveMcpAuthorization,
} from '../src/mcp';

const env = {
  TCG_SCOUT_BASE_URL:
    'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site',
  ALLOWED_GITHUB_USER_ID: '56995940',
  TCG_SCOUT_INTEGRATION_TOKEN: `tcs_int_${'A'.repeat(20)}.${'B'.repeat(43)}`,
} as BridgeEnv;

const requestContext: McpRequestContext = {
  era: 'legacy',
  authInfo: {
    token: 'redacted-test-token',
    clientId: 'test-client',
    scopes: ['scout:read'],
    resource: new URL(MCP_RESOURCE),
  },
};

const authProps = {
  provider: 'github',
  subject: 'github:56995940',
  githubUserId: '56995940',
  githubLogin: 'test-owner',
};

const accessToken = 'github-56995940:test-grant:test-access-token';
const tokenSummary: TokenSummary<typeof authProps> = {
  id: 'token-id',
  grantId: 'test-grant',
  userId: 'github-56995940',
  createdAt: 1_800_000_000,
  expiresAt: 1_800_003_600,
  audience: MCP_RESOURCE,
  scope: ['scout:read', 'scout:write'],
  grant: {
    clientId: 'chatgpt-test-client',
    scope: ['scout:read', 'scout:write'],
    props: authProps,
  },
};

const ingestionState = {
  collectionMethod: 'chatgpt_web_research' as const,
  trackedSources: [],
  lastSuccessfulImportAt: null,
  lastAttemptAt: null,
  lastRunStatus: null,
  actionableError: null,
  recentRuns: [],
  recentFindings: [],
};

function bridgeAuthEnv(summary: TokenSummary<typeof authProps>) {
  return {
    OAUTH_KV: { get: vi.fn(), put: vi.fn() },
    OAUTH_PROVIDER: {
      unwrapToken: () => Promise.resolve(summary),
    },
    TCG_SCOUT_BASE_URL:
      'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site',
    ALLOWED_GITHUB_USER_ID: '56995940',
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'S'.repeat(32),
    COOKIE_ENCRYPTION_KEY: 'C'.repeat(43),
    TCG_SCOUT_INTEGRATION_TOKEN: `tcs_int_${'A'.repeat(20)}.${'B'.repeat(43)}`,
  };
}

function toolRequest(name: string, input: unknown): Request {
  return new Request(MCP_RESOURCE, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      host: 'tcg-scout-mcp-bridge.kennydebie1.workers.dev',
      origin: 'https://chatgpt.com',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: input },
    }),
  });
}

async function jsonRpcBody<Result>(response: Response): Promise<Result> {
  const text = await response.text();
  const dataLine = text
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice(6) : text) as Result;
}

type RegisteredToolForTest = {
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  handler: (input: unknown, context: unknown) => Promise<CallToolResult>;
};

function registeredTools(
  server: ReturnType<typeof createScoutMcpServer>,
): Record<string, RegisteredToolForTest> {
  return (
    server as unknown as {
      _registeredTools: Record<string, RegisteredToolForTest>;
    }
  )._registeredTools;
}

describe('MCP tool surface', () => {
  it('exposes precisely the two scoped TCG Scout tools', () => {
    const server = createScoutMcpServer(env, requestContext, { authProps });
    const tools = registeredTools(server);
    expect(Object.keys(tools)).toEqual([...TOOL_NAMES]);
    expect(tools[TOOL_NAMES[0]]?._meta).toEqual({
      securitySchemes: [{ type: 'oauth2', scopes: ['scout:read'] }],
    });
    expect(tools[TOOL_NAMES[1]]?._meta).toEqual({
      securitySchemes: [{ type: 'oauth2', scopes: ['scout:write'] }],
    });
  });

  it('does not call downstream when the write scope is missing', async () => {
    const mockFetch = vi.fn();
    const server = createScoutMcpServer(env, requestContext, {
      authProps,
      fetchImplementation: mockFetch as typeof fetch,
    });
    const tool = registeredTools(server)[TOOL_NAMES[1]];
    expect(tool).toBeDefined();

    const result = await tool?.handler({}, {});
    expect(result?.isError).toBe(true);
    expect(result?._meta?.['mcp/www_authenticate']).toEqual([
      `Bearer resource_metadata="${BRIDGE_ORIGIN}/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", error_description="Reconnect TCG Community Scout to continue.", scope="scout:write"`,
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call downstream for mismatched identity props', async () => {
    const mockFetch = vi.fn();
    const server = createScoutMcpServer(env, requestContext, {
      authProps: { ...authProps, githubUserId: '1', subject: 'github:1' },
      fetchImplementation: mockFetch as typeof fetch,
    });
    const tool = registeredTools(server)[TOOL_NAMES[0]];
    expect(tool).toBeDefined();

    const result = await tool?.handler(
      { recentRunLimit: 8, recentFindingLimit: 40 },
      {},
    );
    expect(result?.isError).toBe(true);
    expect(result?._meta?.['mcp/www_authenticate']).toEqual([
      expect.stringContaining('error="invalid_token"'),
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call downstream for a token with the wrong audience', async () => {
    const mockFetch = vi.fn();
    const server = createScoutMcpServer(
      env,
      {
        ...requestContext,
        authInfo: {
          ...requestContext.authInfo!,
          resource: new URL('https://example.invalid/mcp'),
        },
      },
      { authProps, fetchImplementation: mockFetch as typeof fetch },
    );
    const tool = registeredTools(server)[TOOL_NAMES[0]];
    const result = await tool?.handler(
      { recentRunLimit: 8, recentFindingLimit: 40 },
      {},
    );
    expect(result?.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('MCP OAuth adapter', () => {
  it('reconstructs standard auth info from the provider token summary', async () => {
    const unwrapAccessToken = vi.fn(() => Promise.resolve(tokenSummary));

    const authorization = await resolveMcpAuthorization(
      new Request(MCP_RESOURCE, {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
      unwrapAccessToken,
      1_800_000_100,
    );

    expect(unwrapAccessToken).toHaveBeenCalledWith(accessToken);
    expect(authorization).toEqual({
      authProps,
      authInfo: {
        token: accessToken,
        clientId: 'chatgpt-test-client',
        scopes: ['scout:read', 'scout:write'],
        expiresAt: 1_800_003_600,
        resource: new URL(MCP_RESOURCE),
        extra: { props: authProps },
      },
    });
  });

  it('rejects an expired, wrong-audience or inconsistent identity summary', async () => {
    const request = new Request(MCP_RESOURCE, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const cases: TokenSummary<typeof authProps>[] = [
      { ...tokenSummary, expiresAt: 1_800_000_100 },
      { ...tokenSummary, audience: 'https://example.invalid/mcp' },
      { ...tokenSummary, userId: 'github-1' },
    ];

    for (const summary of cases) {
      expect(
        await resolveMcpAuthorization(
          request,
          () => Promise.resolve(summary),
          1_800_000_100,
        ),
      ).toBeNull();
    }
  });

  it('passes reconstructed auth through the real MCP request handler', async () => {
    const downstreamFetch = vi.fn(() =>
      Promise.resolve(Response.json({ data: ingestionState })),
    );
    vi.stubGlobal('fetch', downstreamFetch);

    try {
      const response = await mcpApiHandler.fetch(
        toolRequest(TOOL_NAMES[0], {
          recentRunLimit: 8,
          recentFindingLimit: 40,
        }) as never,
        bridgeAuthEnv(tokenSummary) as never,
        {} as ExecutionContext,
      );
      const body = await jsonRpcBody<{
        result?: { structuredContent?: unknown; isError?: boolean };
      }>(response);

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.result?.isError).not.toBe(true);
      expect(body.result?.structuredContent).toEqual(ingestionState);
      expect(downstreamFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns a complete no-store OAuth challenge for an invalid token', async () => {
    const response = await mcpApiHandler.fetch(
      toolRequest(TOOL_NAMES[0], {
        recentRunLimit: 8,
        recentFindingLimit: 40,
      }) as never,
      bridgeAuthEnv({
        ...tokenSummary,
        expiresAt: 1,
      }) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${BRIDGE_ORIGIN}/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Reconnect TCG Community Scout to continue.", scope="scout:read scout:write"`,
    );
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_token',
      error_description: 'Reconnect TCG Community Scout to continue.',
    });
  });

  it('keeps token-level downscoping effective for write tools', async () => {
    const downstreamFetch = vi.fn();
    vi.stubGlobal('fetch', downstreamFetch);

    try {
      const response = await mcpApiHandler.fetch(
        toolRequest(TOOL_NAMES[1], {
          run: {
            id: 'read-only-test',
            startedAt: '2026-09-06T12:00:00.000Z',
            finishedAt: '2026-09-06T12:01:00.000Z',
            sourceChecks: [
              {
                sourceIdentifier: 'r/PokemonTCGNL',
                status: 'checked',
                checkedAt: '2026-09-06T12:01:00.000Z',
                coverageThrough: null,
                errorCode: null,
                detail: null,
              },
            ],
          },
          findings: [],
        }) as never,
        bridgeAuthEnv({ ...tokenSummary, scope: ['scout:read'] }) as never,
        {} as ExecutionContext,
      );
      const body = await jsonRpcBody<{
        result?: { _meta?: Record<string, unknown>; isError?: boolean };
      }>(response);

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.result?.isError).toBe(true);
      expect(body.result?._meta?.['mcp/www_authenticate']).toEqual([
        expect.stringContaining('error="insufficient_scope"'),
      ]);
      expect(downstreamFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
