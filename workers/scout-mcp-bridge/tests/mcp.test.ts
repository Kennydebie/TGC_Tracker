import type {
  CallToolResult,
  McpRequestContext,
} from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';

import { MCP_RESOURCE, TOOL_NAMES } from '../src/constants';
import type { BridgeEnv } from '../src/env';
import { createScoutMcpServer } from '../src/mcp';

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
