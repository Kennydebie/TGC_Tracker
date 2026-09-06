// oxlint-disable typescript/no-deprecated -- The low-level Server is required
// because SDK 1.30's high-level API omits current top-level tool securitySchemes.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { RequestUser } from '../server/user.ts';
import { SCOUT_GAMES } from '../scout-games.ts';
import {
  ScoutIngestionValidationError,
  ScoutRunConflictError,
  validateScoutImportInput,
  type SaveScoutFindingsInput,
  type SaveScoutFindingsResult,
  type ScoutIngestionState,
} from '../scout-ingestion.ts';

export type ScoutStateOptions = {
  recentRunLimit?: number;
  recentFindingLimit?: number;
};

export interface ScoutMcpService {
  getIngestionState(options: ScoutStateOptions): Promise<ScoutIngestionState>;
  saveFindings(input: SaveScoutFindingsInput): Promise<SaveScoutFindingsResult>;
}

export interface ScoutMcpContext {
  user: RequestUser;
  service: ScoutMcpService;
  reportError?: (error: unknown, tool: string, userId: string) => void;
}

const oauthSecurity = [{ type: 'oauth2', scopes: [] }] as const;

const nullableString = { type: ['string', 'null'], minLength: 1 };
const nullableTimestamp = {
  type: ['string', 'null'],
  format: 'date-time',
};
const nullableMilestone = {
  anyOf: [
    { type: 'string', format: 'date-time' },
    {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    { type: 'null' },
  ],
};
const timestamp = { type: 'string', format: 'date-time' };
const httpsUrl = {
  type: 'string',
  format: 'uri',
  pattern: '^[Hh][Tt][Tt][Pp][Ss]://',
  maxLength: 2_048,
  description: 'An HTTPS URL without embedded username or password.',
};
const nullableUrl = {
  type: ['string', 'null'],
  format: 'uri',
  pattern: '^[Hh][Tt][Tt][Pp][Ss]://',
  maxLength: 2_048,
  description: 'An HTTPS URL without embedded username or password, or null.',
};

export const GET_STATE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recentRunLimit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
    recentFindingLimit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 40,
    },
  },
} as const;

const SOURCE_CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceIdentifier', 'status', 'checkedAt'],
  properties: {
    sourceIdentifier: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description:
        'Stable coverage key for the concrete source actually checked. Copy this exact key into every finding obtained from this source.',
    },
    status: { enum: ['checked', 'inaccessible', 'failed'] },
    checkedAt: timestamp,
    coverageThrough: nullableTimestamp,
    errorCode: { ...nullableString, maxLength: 100 },
    detail: { ...nullableString, maxLength: 500 },
  },
} as const;

const EVIDENCE_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['url', 'observedAt'],
  properties: {
    url: httpsUrl,
    observedAt: timestamp,
    note: { ...nullableString, maxLength: 300 },
  },
} as const;

const ACTION_TYPES = [
  'register',
  'preorder',
  'buy',
  'attend',
  'verify',
  'watch',
  'none',
] as const;

const LIFECYCLE_STATUSES = [
  'announced',
  'registration_open',
  'preorder_open',
  'in_stock',
  'closed',
  'cancelled',
  'unknown',
] as const;

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description:
    'One source-backed market-intelligence finding. Keep unavailable facts null or unknown. Milestones accept an exact offset timestamp or a sourced YYYY-MM-DD when no time is published. Never put a future date in publishedAt. price is the observed acquisition or asking price, not resale value or guaranteed profit.',
  required: [
    'sourceKind',
    'sourceIdentifier',
    'game',
    'updateType',
    'summary',
    'observedAt',
    'price',
    'currency',
    'shippingToNetherlands',
    'availability',
    'verificationStatus',
  ],
  properties: {
    sourceKind: {
      enum: [
        'reddit_post',
        'reddit_comment',
        'retailer',
        'official',
        'public_web',
      ],
    },
    sourceIdentifier: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description:
        'Stable coverage key copied exactly from the matching checked run.sourceChecks entry. Put the individual post, listing or article ID in sourcePostOrCommentId instead.',
    },
    game: { enum: SCOUT_GAMES },
    headline: { ...nullableString, maxLength: 180 },
    productName: { ...nullableString, maxLength: 240 },
    productLanguage: { ...nullableString, maxLength: 64 },
    updateType: {
      enum: [
        'deal',
        'restock',
        'preorder',
        'price_change',
        'reprint',
        'release',
        'market_update',
      ],
    },
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    sourceUrl: nullableUrl,
    subreddit: { ...nullableString, maxLength: 80 },
    sourcePostOrCommentId: {
      ...nullableString,
      maxLength: 200,
      description:
        'Exact external post, comment, listing or article identifier, or null. This identifies the item within the checked source and is not the sourceIdentifier coverage key.',
    },
    retailerName: { ...nullableString, maxLength: 160 },
    retailerOrOfficialUrl: nullableUrl,
    publishedAt: nullableTimestamp,
    observedAt: timestamp,
    eventAt: {
      ...nullableMilestone,
      description:
        'Release/event date or exact offset timestamp. Use YYYY-MM-DD when the source publishes no time, or null when unknown.',
    },
    actionOpensAt: {
      ...nullableMilestone,
      description:
        'Date or exact offset timestamp when the action becomes available, or null.',
    },
    actionDeadlineAt: {
      ...nullableMilestone,
      description:
        'Signup, preorder, purchase or attendance deadline as an exact offset timestamp, or YYYY-MM-DD when no time is published. Do not infer either.',
    },
    actionType: { enum: [...ACTION_TYPES, null] },
    actionInstruction: {
      ...nullableString,
      maxLength: 400,
      description:
        'One short factual instruction, or null. A buy/preorder finding must instruct the user to verify completed-sale evidence and full economics, never to purchase.',
    },
    actionUrl: nullableUrl,
    lifecycleStatus: {
      enum: LIFECYCLE_STATUSES,
      default: 'unknown',
    },
    price: {
      type: ['number', 'null'],
      exclusiveMinimum: 0,
      maximum: 1_000_000,
    },
    currency: { enum: ['EUR', 'GBP', 'USD', null] },
    region: { ...nullableString, maxLength: 120 },
    shippingToNetherlands: {
      enum: ['confirmed', 'unavailable', 'unknown'],
    },
    availability: { enum: ['in_stock', 'preorder', 'sold_out', 'unknown'] },
    verificationStatus: {
      enum: ['community_report', 'retailer_checked', 'official_checked'],
    },
    verificationEvidence: EVIDENCE_SCHEMA,
    collectionMethod: {
      const: 'chatgpt_web_research',
      default: 'chatgpt_web_research',
    },
  },
  allOf: [
    {
      anyOf: [
        {
          required: ['sourcePostOrCommentId'],
          properties: {
            sourcePostOrCommentId: { type: 'string', minLength: 1 },
          },
        },
        {
          required: ['sourceUrl'],
          properties: { sourceUrl: httpsUrl },
        },
        {
          required: ['retailerOrOfficialUrl'],
          properties: { retailerOrOfficialUrl: httpsUrl },
        },
      ],
    },
    {
      if: {
        required: ['sourceKind'],
        properties: {
          sourceKind: { enum: ['reddit_post', 'reddit_comment'] },
        },
      },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` is a JSON Schema keyword.
      then: {
        required: ['subreddit', 'sourcePostOrCommentId'],
        properties: {
          subreddit: { type: 'string', minLength: 1, maxLength: 80 },
          sourcePostOrCommentId: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
          },
        },
      },
    },
    {
      if: {
        required: ['verificationStatus'],
        properties: {
          verificationStatus: {
            enum: ['retailer_checked', 'official_checked'],
          },
        },
      },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` is a JSON Schema keyword.
      then: {
        required: ['verificationEvidence'],
        properties: { verificationEvidence: { type: 'object' } },
      },
    },
    {
      anyOf: [
        {
          required: ['price', 'currency'],
          properties: {
            price: { type: 'null' },
            currency: { type: 'null' },
          },
        },
        {
          required: ['price', 'currency'],
          properties: {
            price: {
              type: 'number',
              exclusiveMinimum: 0,
              maximum: 1_000_000,
            },
            currency: { enum: ['EUR', 'GBP', 'USD'] },
          },
        },
      ],
    },
  ],
} as const;

export const SAVE_FINDINGS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['run', 'findings'],
  properties: {
    run: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'startedAt', 'finishedAt', 'sourceChecks'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          pattern: '^[A-Za-z0-9._:@/-]+$',
          description:
            'A stable retry-safe ID. Reuse it only with byte-equivalent logical input.',
        },
        startedAt: timestamp,
        finishedAt: {
          ...timestamp,
          description: 'Must be on or after startedAt.',
        },
        sourceChecks: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          description:
            'One entry per concrete source actually checked. Every finding must copy the exact sourceIdentifier from one entry whose status is checked.',
          items: SOURCE_CHECK_SCHEMA,
        },
      },
    },
    findings: {
      type: 'array',
      maxItems: 25,
      items: FINDING_SCHEMA,
    },
  },
} as const;

const IMPORT_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['index', 'code', 'path', 'message'],
  properties: {
    index: { type: ['integer', 'null'] },
    code: { type: 'string' },
    path: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

export const SAVE_FINDINGS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'runId',
    'status',
    'replayed',
    'inserted',
    'updated',
    'unchanged',
    'rejected',
    'recordIds',
    'errors',
  ],
  properties: {
    runId: { type: 'string' },
    status: { enum: ['completed', 'partial', 'failed'] },
    replayed: { type: 'boolean' },
    inserted: { type: 'integer', minimum: 0 },
    updated: { type: 'integer', minimum: 0 },
    unchanged: { type: 'integer', minimum: 0 },
    rejected: { type: 'integer', minimum: 0 },
    recordIds: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: IMPORT_ERROR_SCHEMA },
  },
} as const;

export const GET_STATE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'collectionMethod',
    'trackedSources',
    'lastSuccessfulImportAt',
    'lastAttemptAt',
    'lastRunStatus',
    'actionableError',
    'recentRuns',
    'recentFindings',
  ],
  properties: {
    collectionMethod: { const: 'chatgpt_web_research' },
    trackedSources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceIdentifier', 'description'],
        properties: {
          sourceIdentifier: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
        },
      },
    },
    lastSuccessfulImportAt: nullableTimestamp,
    lastAttemptAt: nullableTimestamp,
    lastRunStatus: { enum: ['completed', 'partial', 'failed', null] },
    actionableError: nullableString,
    recentRuns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'runId',
          'status',
          'finishedAt',
          'inserted',
          'updated',
          'unchanged',
          'rejected',
          'sourceChecks',
        ],
        properties: {
          runId: { type: 'string', minLength: 1 },
          status: { enum: ['completed', 'partial', 'failed'] },
          finishedAt: timestamp,
          inserted: { type: 'integer', minimum: 0 },
          updated: { type: 'integer', minimum: 0 },
          unchanged: { type: 'integer', minimum: 0 },
          rejected: { type: 'integer', minimum: 0 },
          sourceChecks: {
            type: 'array',
            items: {
              ...SOURCE_CHECK_SCHEMA,
              required: [
                'sourceIdentifier',
                'status',
                'checkedAt',
                'coverageThrough',
                'errorCode',
                'detail',
              ],
            },
          },
        },
      },
    },
    recentFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'sourceIdentifier',
          'sourcePostOrCommentId',
          'sourceUrl',
          'retailerOrOfficialUrl',
          'materialHash',
          'lastObservedAt',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          sourceIdentifier: { type: 'string', minLength: 1 },
          sourcePostOrCommentId: { ...nullableString, maxLength: 200 },
          sourceUrl: nullableUrl,
          retailerOrOfficialUrl: nullableUrl,
          materialHash: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
          },
          lastObservedAt: timestamp,
        },
      },
    },
  },
} as const;

// MCP SDK 1.30 does not yet type the current top-level securitySchemes field,
// so discovery uses the low-level Server and a narrow wire-type cast.
const tools = [
  {
    name: 'get_scout_ingestion_state',
    title: 'Get TCG Scout ingestion state',
    description:
      "Call before research or import. Returns only the signed-in account's recent scheduled-research imports, broad source coverage, material hashes, and run outcomes so duplicates and coverage gaps can be avoided.",
    inputSchema: GET_STATE_INPUT_SCHEMA,
    outputSchema: GET_STATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    securitySchemes: oauthSecurity,
    _meta: { securitySchemes: oauthSecurity },
  },
  {
    name: 'save_scout_findings',
    title: 'Save TCG Scout findings',
    description:
      'Validate and save up to 25 source-backed Pokémon, One Piece TCG or Riftbound market-intelligence findings plus retry-safe source coverage for the signed-in account. Findings may come from official sites, organizers, retailers, marketplaces, news, Reddit, Discord or other public web sources. For every finding, copy sourceIdentifier exactly from its checked run.sourceChecks entry; keep the exact post, listing or article ID in sourcePostOrCommentId and its permalink in sourceUrl. Preserve unknown values, original provenance, and sourced event/action dates without inventing a time. Scheduled findings are not purchase recommendations. Call get_scout_ingestion_state first.',
    inputSchema: SAVE_FINDINGS_INPUT_SCHEMA,
    outputSchema: SAVE_FINDINGS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    securitySchemes: oauthSecurity,
    _meta: { securitySchemes: oauthSecurity },
  },
] as const;

const stateOptionsSchema = z
  .object({
    recentRunLimit: z.number().int().min(1).max(20).optional(),
    recentFindingLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const outputTimestampSchema = z.string().datetime({ offset: true });
const outputNullableTimestampSchema = outputTimestampSchema.nullable();
const importErrorOutputSchema = z
  .object({
    index: z.number().int().nonnegative().nullable(),
    code: z.string(),
    path: z.string(),
    message: z.string(),
  })
  .strict();
const saveFindingsOutputSchema = z
  .object({
    runId: z.string().min(1),
    status: z.enum(['completed', 'partial', 'failed']),
    replayed: z.boolean(),
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    recordIds: z.array(z.string().min(1)),
    errors: z.array(importErrorOutputSchema),
  })
  .strict();
const sourceCheckOutputSchema = z
  .object({
    sourceIdentifier: z.string().min(1),
    status: z.enum(['checked', 'inaccessible', 'failed']),
    checkedAt: outputTimestampSchema,
    coverageThrough: outputNullableTimestampSchema,
    errorCode: z.string().min(1).nullable(),
    detail: z.string().min(1).nullable(),
  })
  .strict();
const ingestionStateOutputSchema = z
  .object({
    collectionMethod: z.literal('chatgpt_web_research'),
    trackedSources: z.array(
      z
        .object({
          sourceIdentifier: z.string().min(1),
          description: z.string().min(1),
        })
        .strict(),
    ),
    lastSuccessfulImportAt: outputNullableTimestampSchema,
    lastAttemptAt: outputNullableTimestampSchema,
    lastRunStatus: z.enum(['completed', 'partial', 'failed']).nullable(),
    actionableError: z.string().min(1).nullable(),
    recentRuns: z.array(
      z
        .object({
          runId: z.string().min(1),
          status: z.enum(['completed', 'partial', 'failed']),
          finishedAt: outputTimestampSchema,
          inserted: z.number().int().nonnegative(),
          updated: z.number().int().nonnegative(),
          unchanged: z.number().int().nonnegative(),
          rejected: z.number().int().nonnegative(),
          sourceChecks: z.array(sourceCheckOutputSchema),
        })
        .strict(),
    ),
    recentFindings: z.array(
      z
        .object({
          id: z.string().min(1),
          sourceIdentifier: z.string().min(1),
          sourcePostOrCommentId: z.string().min(1).nullable(),
          sourceUrl: z.string().url().nullable(),
          retailerOrOfficialUrl: z.string().url().nullable(),
          materialHash: z.string().regex(/^[a-f0-9]{64}$/),
          lastObservedAt: outputTimestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

function invalid(message: string): never {
  throw new McpError(ErrorCode.InvalidParams, `Invalid tool input: ${message}`);
}

function ok(
  structuredContent: Record<string, unknown>,
  message: string,
): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent,
  };
}

export function createScoutMcpServer(context: ScoutMcpContext): Server {
  const server = new Server(
    { name: 'tcg-scout-community-radar', version: '1.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Call get_scout_ingestion_state before save_scout_findings. Research broadly across relevant official, retailer, marketplace, news and community sources for Pokémon, One Piece TCG and Riftbound. Every finding.sourceIdentifier must exactly copy a sourceIdentifier from the same run whose status is checked; place the exact post, comment, listing or article ID in sourcePostOrCommentId and the permalink in sourceUrl. Use stable run IDs, preserve unknown facts, retain source provenance, and record dates or exact times only as published. Never turn an asking price into profit, ROI, or a purchase recommendation. Report the returned import counts and retry only corrected rejected records with a new run ID.',
    },
  );
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => ({ tools }) as unknown as ListToolsResult,
  );
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    try {
      if (name === 'get_scout_ingestion_state') {
        const parsed = stateOptionsSchema.safeParse(
          request.params.arguments ?? {},
        );
        if (!parsed.success)
          invalid(
            parsed.error.issues
              .slice(0, 8)
              .map(
                (issue) =>
                  `${issue.path.join('.') || 'input'}: ${issue.message}`,
              )
              .join('; '),
          );
        const state = ingestionStateOutputSchema.parse(
          await context.service.getIngestionState(parsed.data),
        );
        return ok(
          state as unknown as Record<string, unknown>,
          'TCG Scout ingestion state returned.',
        );
      }
      if (name === 'save_scout_findings') {
        const input = validateScoutImportInput(request.params.arguments ?? {});
        const result = saveFindingsOutputSchema.parse(
          await context.service.saveFindings(input),
        );
        return ok(
          result as unknown as Record<string, unknown>,
          `Import ${result.runId} processed: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged, ${result.rejected} rejected.`,
        );
      }
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    } catch (error) {
      if (error instanceof McpError) throw error;
      if (error instanceof ScoutIngestionValidationError)
        invalid(
          error.issues
            .slice(0, 8)
            .map((issue) => `${issue.path || 'input'}: ${issue.message}`)
            .join('; '),
        );
      if (error instanceof ScoutRunConflictError) {
        const result: SaveScoutFindingsResult = {
          runId: error.runId,
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
              message:
                'This run ID was already used with different input. Use the original payload or a new run ID.',
            },
          ],
        };
        return {
          ...ok(
            result as unknown as Record<string, unknown>,
            result.errors[0].message,
          ),
          isError: true,
        };
      }
      context.reportError?.(error, name, context.user.id);
      return {
        content: [
          {
            type: 'text',
            text:
              name === 'get_scout_ingestion_state'
                ? 'TCG Scout could not read ingestion state. Try again later.'
                : 'TCG Scout could not save this import. Check ingestion state before retrying, and reuse a run ID only with identical input.',
          },
        ],
        isError: true,
      };
    }
  });
  return server;
}
