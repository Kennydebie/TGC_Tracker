import assert from 'node:assert/strict';
import test from 'node:test';

import { createScoutMcpHandler } from '../lib/mcp/handler.ts';
import {
  SAVE_FINDINGS_INPUT_SCHEMA,
  type ScoutMcpService,
} from '../lib/mcp/scout-server.ts';
import type {
  SaveScoutFindingsInput,
  SaveScoutFindingsResult,
  ScoutIngestionState,
} from '../lib/scout-ingestion.ts';
import type { RequestUser } from '../lib/server/user.ts';

const metadataUrl =
  'https://tcg-scout.example/.well-known/oauth-protected-resource';
const user: RequestUser = {
  id: 'authenticated-user',
  email: 'owner@example.test',
  displayName: 'Owner',
};

function state(userId = user.id): ScoutIngestionState {
  return {
    collectionMethod: 'chatgpt_web_research',
    trackedSources: [
      {
        sourceIdentifier: 'reddit:r/PokemonTCGNL',
        description: `Visible only to ${userId}`,
      },
    ],
    lastSuccessfulImportAt: null,
    lastAttemptAt: null,
    lastRunStatus: null,
    actionableError: null,
    recentRuns: [],
    recentFindings: [],
  };
}

function saved(): SaveScoutFindingsResult {
  return {
    runId: 'run:test',
    status: 'completed',
    replayed: false,
    inserted: 1,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    recordIds: ['scout-finding:test'],
    errors: [],
  };
}

function validSaveInput(): SaveScoutFindingsInput {
  return {
    run: {
      id: 'run:test',
      startedAt: '2026-09-05T20:00:00Z',
      finishedAt: '2026-09-05T20:01:00Z',
      sourceChecks: [
        {
          sourceIdentifier: 'reddit:r/PokemonTCGNL',
          status: 'checked',
          checkedAt: '2026-09-05T20:01:00Z',
          coverageThrough: '2026-09-05T20:01:00Z',
          errorCode: null,
          detail: null,
        },
      ],
    },
    findings: [
      {
        sourceKind: 'reddit_post',
        sourceIdentifier: 'reddit:r/PokemonTCGNL',
        game: 'pokemon',
        headline: null,
        productName: 'Test-only product',
        productLanguage: null,
        updateType: 'deal',
        summary: 'TEST RECORD: protocol-only import.',
        sourceUrl: 'https://www.reddit.com/r/PokemonTCGNL/comments/test',
        subreddit: 'PokemonTCGNL',
        sourcePostOrCommentId: 'post:test',
        retailerName: null,
        retailerOrOfficialUrl: null,
        publishedAt: null,
        observedAt: '2026-09-05T20:01:00Z',
        eventAt: null,
        actionOpensAt: null,
        actionDeadlineAt: null,
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'unknown',
        price: null,
        currency: null,
        region: null,
        shippingToNetherlands: 'unknown',
        availability: 'unknown',
        verificationStatus: 'community_report',
        verificationEvidence: null,
        collectionMethod: 'chatgpt_web_research',
      },
    ],
  };
}

function request(
  body: unknown,
  options: { authenticated?: boolean; rawBody?: string } = {},
) {
  return new Request('https://tcg-scout.example/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(options.authenticated === false
        ? {}
        : { authorization: 'Bearer valid' }),
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

function handler(
  service: ScoutMcpService,
  options: {
    maxBodyBytes?: number;
    reportError?: (error: unknown, tool: string, userId: string) => void;
  } = {},
) {
  return createScoutMcpHandler({
    authenticate: (incoming) =>
      incoming.headers.get('authorization') === 'Bearer valid' ? user : null,
    createService: () => service,
    resourceMetadataUrl: metadataUrl,
    ...options,
  });
}

void test('MCP rejects unauthenticated requests before reading or dispatching them', async () => {
  let created = false;
  const handle = createScoutMcpHandler({
    authenticate: () => null,
    createService: () => {
      created = true;
      throw new Error('must not be called');
    },
    resourceMetadataUrl: metadataUrl,
  });
  for (const method of ['GET', 'POST']) {
    const response = await handle(
      method === 'POST'
        ? request(rpc('tools/list'), { authenticated: false })
        : new Request('https://tcg-scout.example/mcp', { method }),
    );
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get('www-authenticate'),
      `Bearer resource_metadata="${metadataUrl}"`,
    );
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(created, false);
});

void test('MCP initializes and discovers exactly the two scoped OAuth tools', async () => {
  const service: ScoutMcpService = {
    getIngestionState: async () => state(),
    saveFindings: async () => saved(),
  };
  const handle = handler(service);
  const initialize = await handle(
    request(
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'tcg-scout-test', version: '1.0.0' },
      }),
    ),
  );
  assert.equal(initialize.status, 200);
  const initializeBody = (await initialize.json()) as {
    result: { serverInfo: { name: string } };
  };
  assert.equal(
    initializeBody.result.serverInfo.name,
    'tcg-scout-community-radar',
  );

  const response = await handle(request(rpc('tools/list')));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = (await response.json()) as {
    result: {
      tools: Array<{
        name: string;
        securitySchemes: unknown;
        _meta: { securitySchemes: unknown };
        annotations: { readOnlyHint: boolean };
        inputSchema: { additionalProperties: boolean };
        outputSchema: {
          additionalProperties: boolean;
          properties: {
            recentRuns: { items: { required?: string[] } };
            recentFindings: { items: { required?: string[] } };
          };
        };
      }>;
    };
  };
  const tools = body.result.tools;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['get_scout_ingestion_state', 'save_scout_findings'],
  );
  for (const tool of tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: [] }]);
    assert.deepEqual(tool._meta.securitySchemes, [
      { type: 'oauth2', scopes: [] },
    ]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.additionalProperties, false);
  }
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[1].annotations.readOnlyHint, false);
  assert.ok(tools[0].outputSchema.properties.recentRuns.items.required);
  assert.ok(tools[0].outputSchema.properties.recentFindings.items.required);
  assert.deepEqual(
    SAVE_FINDINGS_INPUT_SCHEMA.properties.findings.items.properties.game.enum,
    ['pokemon', 'one_piece', 'riftbound'],
  );
  assert.match(
    SAVE_FINDINGS_INPUT_SCHEMA.properties.findings.items.properties
      .sourceIdentifier.description,
    /copied exactly/i,
  );
});

void test('MCP calls inject the authenticated account and return structured results', async () => {
  const calls: Array<{ kind: string; value: unknown }> = [];
  const handle = createScoutMcpHandler({
    authenticate: (incoming) =>
      incoming.headers.get('authorization') === 'Bearer valid' ? user : null,
    createService: (account) => ({
      getIngestionState: async (options) => {
        calls.push({ kind: `state:${account.id}`, value: options });
        return state(account.id);
      },
      saveFindings: async (input) => {
        calls.push({ kind: `save:${account.id}`, value: input });
        return saved();
      },
    }),
    resourceMetadataUrl: metadataUrl,
  });
  const stateResponse = await handle(
    request(
      rpc('tools/call', {
        name: 'get_scout_ingestion_state',
        arguments: { recentRunLimit: 4 },
      }),
    ),
  );
  const stateBody = (await stateResponse.json()) as {
    result: { structuredContent: ScoutIngestionState };
  };
  assert.equal(
    stateBody.result.structuredContent.trackedSources[0].description,
    `Visible only to ${user.id}`,
  );

  const saveResponse = await handle(
    request(
      rpc('tools/call', {
        name: 'save_scout_findings',
        arguments: validSaveInput(),
      }),
    ),
  );
  const saveBody = (await saveResponse.json()) as {
    result: { structuredContent: SaveScoutFindingsResult };
  };
  assert.equal(saveBody.result.structuredContent.inserted, 1);
  assert.deepEqual(
    calls.map((call) => call.kind),
    [`state:${user.id}`, `save:${user.id}`],
  );
});

void test('MCP rejects invalid input without calling the write service', async () => {
  let saves = 0;
  const handle = handler({
    getIngestionState: async () => state(),
    saveFindings: async () => {
      saves += 1;
      return saved();
    },
  });
  const invalid = validSaveInput() as unknown as Record<string, unknown>;
  (invalid.findings as Array<Record<string, unknown>>)[0].sourceUrl =
    'http://localhost/private';
  const response = await handle(
    request(
      rpc('tools/call', {
        name: 'save_scout_findings',
        arguments: invalid,
      }),
    ),
  );
  const body = (await response.json()) as { error: { code: number } };
  assert.equal(body.error.code, -32_602);
  assert.equal(saves, 0);
});

void test('MCP bounds bodies, rejects unsupported methods, and hides service errors', async () => {
  const reported: Array<{ tool: string; userId: string }> = [];
  const handle = handler(
    {
      getIngestionState: async () => {
        throw new Error('database password must stay hidden');
      },
      saveFindings: async () => saved(),
    },
    {
      maxBodyBytes: 2_048,
      reportError: (_error, tool, userId) => reported.push({ tool, userId }),
    },
  );
  const malformed = await handle(
    request({}, { rawBody: '{', authenticated: true }),
  );
  assert.equal(malformed.status, 400);
  const oversized = await handle(
    request({}, { rawBody: JSON.stringify({ value: 'x'.repeat(3_000) }) }),
  );
  assert.equal(oversized.status, 413);
  const wrongMethod = await handle(
    new Request('https://tcg-scout.example/mcp', {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid' },
    }),
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const failure = await handle(
    request(
      rpc('tools/call', {
        name: 'get_scout_ingestion_state',
        arguments: {},
      }),
    ),
  );
  const text = await failure.text();
  assert.equal(text.includes('database password'), false);
  assert.equal(
    (JSON.parse(text) as { result: { isError: boolean } }).result.isError,
    true,
  );
  assert.deepEqual(reported, [
    { tool: 'get_scout_ingestion_state', userId: user.id },
  ]);
});
