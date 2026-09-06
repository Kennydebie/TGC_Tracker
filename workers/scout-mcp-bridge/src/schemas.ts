import { z } from 'zod';

export const COLLECTION_METHOD = 'chatgpt_web_research' as const;

export const SCOUT_GAMES = ['pokemon', 'one_piece', 'riftbound'] as const;

export const ACTION_TYPES = [
  'register',
  'preorder',
  'buy',
  'attend',
  'verify',
  'watch',
  'none',
] as const;

export const LIFECYCLE_STATUSES = [
  'announced',
  'registration_open',
  'preorder_open',
  'in_stock',
  'closed',
  'cancelled',
  'unknown',
] as const;

const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO calendar date (YYYY-MM-DD).')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, 'Use a real calendar date.');
const milestoneSchema = z.union([timestampSchema, calendarDateSchema]);

function actionWindowIsReversed(opensAt: string, deadlineAt: string): boolean {
  if (
    calendarDateSchema.safeParse(opensAt).success ||
    calendarDateSchema.safeParse(deadlineAt).success
  )
    return opensAt.slice(0, 10) > deadlineAt.slice(0, 10);
  return Date.parse(opensAt) > Date.parse(deadlineAt);
}
const nullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional().default(null);

const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use an HTTPS URL without embedded credentials.');

const nullableUrlSchema = httpsUrlSchema.nullable().optional().default(null);

export const getStateInputSchema = z
  .object({
    recentRunLimit: z.number().int().min(1).max(20).optional().default(8),
    recentFindingLimit: z.number().int().min(1).max(100).optional().default(40),
  })
  .strict();

export const sourceCheckSchema = z
  .object({
    sourceIdentifier: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        'Stable coverage key for the concrete source actually checked. Copy this exact key into every finding obtained from this source.',
      ),
    status: z.enum(['checked', 'inaccessible', 'failed']),
    checkedAt: timestampSchema,
    coverageThrough: timestampSchema.nullable().optional().default(null),
    errorCode: nullableText(100),
    detail: nullableText(500),
  })
  .strict();

export const runSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:@/-]+$/),
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    sourceChecks: z.array(sourceCheckSchema).min(1).max(20),
  })
  .strict()
  .superRefine((run, context) => {
    if (Date.parse(run.finishedAt) < Date.parse(run.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'finishedAt must be on or after startedAt.',
      });
    }

    const identifiers = new Set<string>();
    run.sourceChecks.forEach((check, index) => {
      const key = check.sourceIdentifier.toLocaleLowerCase('en-US');
      if (identifiers.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['sourceChecks', index, 'sourceIdentifier'],
          message: 'Each sourceIdentifier may appear only once per run.',
        });
      }
      identifiers.add(key);
    });
  });

export const verificationEvidenceSchema = z
  .object({
    url: httpsUrlSchema,
    observedAt: timestampSchema,
    note: nullableText(300),
  })
  .strict();

export const findingSchema = z
  .object({
    sourceKind: z.enum([
      'reddit_post',
      'reddit_comment',
      'retailer',
      'official',
      'public_web',
    ]),
    sourceIdentifier: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        'Stable coverage key copied exactly from the matching checked run.sourceChecks entry. Put the individual post, listing or article ID in sourcePostOrCommentId instead.',
      ),
    game: z.enum(SCOUT_GAMES),
    headline: nullableText(180),
    productName: nullableText(240),
    productLanguage: nullableText(64),
    updateType: z.enum([
      'deal',
      'restock',
      'preorder',
      'price_change',
      'reprint',
      'release',
      'market_update',
    ]),
    summary: z.string().trim().min(1).max(800),
    sourceUrl: nullableUrlSchema,
    subreddit: nullableText(80),
    sourcePostOrCommentId: nullableText(200).describe(
      'Exact external post, comment, listing or article identifier, or null. This identifies the item within the checked source and is not the sourceIdentifier coverage key.',
    ),
    retailerName: nullableText(160),
    retailerOrOfficialUrl: nullableUrlSchema,
    publishedAt: timestampSchema.nullable().optional().default(null),
    observedAt: timestampSchema,
    eventAt: milestoneSchema.nullable().optional().default(null),
    actionOpensAt: milestoneSchema.nullable().optional().default(null),
    actionDeadlineAt: milestoneSchema.nullable().optional().default(null),
    actionType: z.enum(ACTION_TYPES).nullable().optional().default(null),
    actionInstruction: nullableText(400),
    actionUrl: nullableUrlSchema,
    lifecycleStatus: z.enum(LIFECYCLE_STATUSES).optional().default('unknown'),
    price: z.number().finite().positive().max(1_000_000).nullable(),
    currency: z.enum(['EUR', 'GBP', 'USD']).nullable(),
    region: nullableText(120),
    shippingToNetherlands: z.enum(['confirmed', 'unavailable', 'unknown']),
    availability: z.enum(['in_stock', 'preorder', 'sold_out', 'unknown']),
    verificationStatus: z.enum([
      'community_report',
      'retailer_checked',
      'official_checked',
    ]),
    verificationEvidence: verificationEvidenceSchema
      .nullable()
      .optional()
      .default(null),
    collectionMethod: z
      .literal(COLLECTION_METHOD)
      .optional()
      .default(COLLECTION_METHOD),
  })
  .strict()
  .superRefine((finding, context) => {
    if ((finding.price === null) !== (finding.currency === null)) {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'price and currency must both be known or both be null.',
      });
    }
    if (
      !finding.sourcePostOrCommentId &&
      !finding.sourceUrl &&
      !finding.retailerOrOfficialUrl
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'Provide source provenance.',
      });
    }
    if (
      (finding.sourceKind === 'reddit_post' ||
        finding.sourceKind === 'reddit_comment') &&
      (!finding.subreddit || !finding.sourcePostOrCommentId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourcePostOrCommentId'],
        message: 'Reddit findings require subreddit and post/comment ID.',
      });
    }
    if (
      finding.verificationStatus !== 'community_report' &&
      !finding.verificationEvidence
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verificationEvidence'],
        message: 'Checked claims require verification evidence.',
      });
    }
    const hasActionDetails = Boolean(
      finding.actionInstruction ||
      finding.actionUrl ||
      finding.actionOpensAt ||
      finding.actionDeadlineAt,
    );
    if (
      hasActionDetails &&
      (!finding.actionType || finding.actionType === 'none')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actionType'],
        message: 'Action details require a concrete actionType.',
      });
    }
    if (
      finding.actionType &&
      finding.actionType !== 'none' &&
      !finding.actionInstruction
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actionInstruction'],
        message: 'A concrete actionType requires an actionInstruction.',
      });
    }
    if (
      finding.actionOpensAt &&
      finding.actionDeadlineAt &&
      actionWindowIsReversed(finding.actionOpensAt, finding.actionDeadlineAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actionDeadlineAt'],
        message: 'actionDeadlineAt must be on or after actionOpensAt.',
      });
    }
  });

export const saveFindingsInputSchema = z
  .object({
    run: runSchema,
    findings: z.array(findingSchema).max(25),
  })
  .strict();

const importErrorSchema = z
  .object({
    index: z.number().int().nonnegative().nullable(),
    code: z.string().min(1).max(100),
    path: z.string().max(500),
    message: z.string().min(1).max(1_000),
  })
  .strict();

export const saveFindingsOutputSchema = z
  .object({
    runId: z.string().min(1).max(200),
    status: z.enum(['completed', 'partial', 'failed']),
    replayed: z.boolean(),
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    recordIds: z.array(z.string().min(1).max(200)).max(25),
    errors: z.array(importErrorSchema).max(100),
  })
  .strict();

const sourceCheckOutputSchema = z
  .object({
    sourceIdentifier: z.string().min(1).max(200),
    status: z.enum(['checked', 'inaccessible', 'failed']),
    checkedAt: timestampSchema,
    coverageThrough: nullableTimestampSchema,
    errorCode: z.string().min(1).max(100).nullable(),
    detail: z.string().min(1).max(500).nullable(),
  })
  .strict();

export const ingestionStateOutputSchema = z
  .object({
    collectionMethod: z.literal(COLLECTION_METHOD),
    trackedSources: z.array(
      z
        .object({
          sourceIdentifier: z.string().min(1).max(200),
          description: z.string().min(1).max(500),
        })
        .strict(),
    ),
    lastSuccessfulImportAt: nullableTimestampSchema,
    lastAttemptAt: nullableTimestampSchema,
    lastRunStatus: z.enum(['completed', 'partial', 'failed']).nullable(),
    actionableError: z.string().min(1).max(1_000).nullable(),
    recentRuns: z.array(
      z
        .object({
          runId: z.string().min(1).max(200),
          status: z.enum(['completed', 'partial', 'failed']),
          finishedAt: timestampSchema,
          inserted: z.number().int().nonnegative(),
          updated: z.number().int().nonnegative(),
          unchanged: z.number().int().nonnegative(),
          rejected: z.number().int().nonnegative(),
          sourceChecks: z.array(sourceCheckOutputSchema).max(20),
        })
        .strict(),
    ),
    recentFindings: z.array(
      z
        .object({
          id: z.string().min(1).max(200),
          sourceIdentifier: z.string().min(1).max(200),
          sourcePostOrCommentId: z.string().min(1).max(200).nullable(),
          sourceUrl: httpsUrlSchema.nullable(),
          retailerOrOfficialUrl: httpsUrlSchema.nullable(),
          materialHash: z.string().regex(/^[a-f0-9]{64}$/),
          lastObservedAt: timestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const stateEnvelopeSchema = z
  .object({ data: ingestionStateOutputSchema })
  .strict();
export const saveEnvelopeSchema = z
  .object({ data: saveFindingsOutputSchema })
  .strict();

export type GetStateInput = z.infer<typeof getStateInputSchema>;
export type SaveFindingsInput = z.infer<typeof saveFindingsInputSchema>;
export type IngestionState = z.infer<typeof ingestionStateOutputSchema>;
export type SaveFindingsOutput = z.infer<typeof saveFindingsOutputSchema>;
