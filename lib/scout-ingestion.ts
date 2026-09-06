import { z } from 'zod';

import { normaliseCommunityText, redactPersonalData } from './community.ts';
import { SCOUT_GAMES } from './scout-games.ts';

export const SCOUT_COLLECTION_METHOD = 'chatgpt_web_research' as const;
export const SCOUT_MAX_BATCH_SIZE = 25;
export const SCOUT_MAX_CLOCK_SKEW_MS = 10 * 60_000;
export const SCOUT_MAX_RUN_DURATION_MS = 24 * 60 * 60_000;
export const SCOUT_TRACKED_SOURCES = [
  {
    sourceIdentifier: 'official:publishers-and-organizers',
    description:
      'Discovery category only—not a source-check key. Check concrete official Pokémon, One Piece TCG and Riftbound publisher, distributor, event and registration sources.',
  },
  {
    sourceIdentifier: 'marketplaces:eu',
    description:
      'Discovery category only—not a source-check key. Check concrete eBay, Amazon and Marktplaats sources for relevant NL/EU listings or material price changes.',
  },
  {
    sourceIdentifier: 'retailers:eu',
    description:
      'Discovery category only—not a source-check key. Check concrete NL/EU retailer sources for stock, preorder, allocation, signup and cancellation updates.',
  },
  {
    sourceIdentifier: 'community:public',
    description:
      'Discovery category only—not a source-check key. Check concrete public Reddit, Discord, forum, news and social sources and retain original provenance.',
  },
  {
    sourceIdentifier: 'market-evidence:public',
    description:
      'Discovery category only—not a source-check key. Check concrete sources for completed-sale, supply and demand evidence; active asks stay separate from sold evidence.',
  },
] as const;

export const SCOUT_ACTION_TYPES = [
  'register',
  'preorder',
  'buy',
  'attend',
  'verify',
  'watch',
  'none',
] as const;

export const SCOUT_LIFECYCLE_STATUSES = [
  'announced',
  'registration_open',
  'preorder_open',
  'in_stock',
  'closed',
  'cancelled',
  'unknown',
] as const;

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use an HTTPS URL without embedded credentials.');

const nullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional().default(null);

const nullableUrl = httpsUrl.nullable().optional().default(null);
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable().optional().default(null);
const calendarDate = z
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
const milestone = z.union([timestamp, calendarDate]);
const nullableMilestone = milestone.nullable().optional().default(null);

function actionWindowIsReversed(opensAt: string, deadlineAt: string): boolean {
  if (
    calendarDate.safeParse(opensAt).success ||
    calendarDate.safeParse(deadlineAt).success
  )
    return opensAt.slice(0, 10) > deadlineAt.slice(0, 10);
  return Date.parse(opensAt) > Date.parse(deadlineAt);
}

export const scoutSourceCheckSchema = z
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
    checkedAt: timestamp,
    coverageThrough: nullableTimestamp,
    errorCode: nullableText(100),
    detail: nullableText(500),
  })
  .strict();

export const scoutRunSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:@/-]+$/),
    startedAt: timestamp,
    finishedAt: timestamp,
    sourceChecks: z.array(scoutSourceCheckSchema).min(1).max(20),
  })
  .strict()
  .superRefine((run, context) => {
    const startedAt = Date.parse(run.startedAt);
    const finishedAt = Date.parse(run.finishedAt);
    if (finishedAt < startedAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finishedAt'],
        message: 'finishedAt must be on or after startedAt.',
      });
    const identifiers = new Set<string>();
    run.sourceChecks.forEach((check, index) => {
      const key = check.sourceIdentifier.toLocaleLowerCase('en-US');
      if (identifiers.has(key))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceChecks', index, 'sourceIdentifier'],
          message: 'Each sourceIdentifier may appear only once per run.',
        });
      identifiers.add(key);
    });
  });

export const scoutVerificationEvidenceSchema = z
  .object({
    url: httpsUrl,
    observedAt: timestamp,
    note: nullableText(300),
  })
  .strict();

export const scoutFindingSchema = z
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
        'Stable coverage key copied exactly from the matching checked run.sourceChecks entry. Do not put the individual post, listing or article ID here.',
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
    sourceUrl: nullableUrl,
    subreddit: nullableText(80),
    sourcePostOrCommentId: nullableText(200).describe(
      'Exact external post, comment, listing or article identifier when one exists. This identifies the item within the checked source; it is not the sourceIdentifier coverage key.',
    ),
    retailerName: nullableText(160),
    retailerOrOfficialUrl: nullableUrl,
    publishedAt: nullableTimestamp,
    observedAt: timestamp,
    eventAt: nullableMilestone,
    actionOpensAt: nullableMilestone,
    actionDeadlineAt: nullableMilestone,
    actionType: z.enum(SCOUT_ACTION_TYPES).nullable().optional().default(null),
    actionInstruction: nullableText(400),
    actionUrl: nullableUrl,
    lifecycleStatus: z
      .enum(SCOUT_LIFECYCLE_STATUSES)
      .optional()
      .default('unknown'),
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
    verificationEvidence: scoutVerificationEvidenceSchema
      .nullable()
      .optional()
      .default(null),
    collectionMethod: z
      .literal(SCOUT_COLLECTION_METHOD)
      .optional()
      .default(SCOUT_COLLECTION_METHOD),
  })
  .strict()
  .superRefine((finding, context) => {
    if ((finding.price === null) !== (finding.currency === null))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currency'],
        message:
          'price and currency must either both be known or both be null.',
      });
    if (
      !finding.sourcePostOrCommentId &&
      !finding.sourceUrl &&
      !finding.retailerOrOfficialUrl
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message:
          'Provide a source post/comment identifier, source URL, or retailer/official URL.',
      });
    if (
      (finding.sourceKind === 'reddit_post' ||
        finding.sourceKind === 'reddit_comment') &&
      (!finding.subreddit || !finding.sourcePostOrCommentId)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourcePostOrCommentId'],
        message:
          'Reddit findings require subreddit and post/comment identifier provenance.',
      });
    if (
      finding.verificationStatus !== 'community_report' &&
      !finding.verificationEvidence
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['verificationEvidence'],
        message:
          'Checked claims require an evidence URL and verification observation time.',
      });
    const hasActionDetails = Boolean(
      finding.actionInstruction ||
      finding.actionUrl ||
      finding.actionOpensAt ||
      finding.actionDeadlineAt,
    );
    if (
      hasActionDetails &&
      (!finding.actionType || finding.actionType === 'none')
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionType'],
        message: 'Action details require a concrete actionType.',
      });
    if (
      finding.actionType &&
      finding.actionType !== 'none' &&
      !finding.actionInstruction
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionInstruction'],
        message: 'A concrete actionType requires an actionInstruction.',
      });
    if (
      finding.actionOpensAt &&
      finding.actionDeadlineAt &&
      actionWindowIsReversed(finding.actionOpensAt, finding.actionDeadlineAt)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionDeadlineAt'],
        message: 'actionDeadlineAt must be on or after actionOpensAt.',
      });
  });

export const saveScoutFindingsInputSchema = z
  .object({
    run: scoutRunSchema,
    findings: z.array(scoutFindingSchema).max(SCOUT_MAX_BATCH_SIZE),
  })
  .strict();

export type ScoutSourceCheck = z.infer<typeof scoutSourceCheckSchema>;
export type ScoutRunInput = z.infer<typeof scoutRunSchema>;
export type ScoutFindingInput = z.infer<typeof scoutFindingSchema>;
export type SaveScoutFindingsInput = z.infer<
  typeof saveScoutFindingsInputSchema
>;

export type ScoutImportError = {
  index: number | null;
  code: string;
  path: string;
  message: string;
};

export type SaveScoutFindingsResult = {
  runId: string;
  status: 'completed' | 'partial' | 'failed';
  replayed: boolean;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
  recordIds: string[];
  errors: ScoutImportError[];
};

export type ScoutIngestionState = {
  collectionMethod: typeof SCOUT_COLLECTION_METHOD;
  trackedSources: Array<{
    sourceIdentifier: string;
    description: string;
  }>;
  lastSuccessfulImportAt: string | null;
  lastAttemptAt: string | null;
  lastRunStatus: 'completed' | 'partial' | 'failed' | null;
  actionableError: string | null;
  recentRuns: Array<{
    runId: string;
    status: 'completed' | 'partial' | 'failed';
    finishedAt: string;
    inserted: number;
    updated: number;
    unchanged: number;
    rejected: number;
    sourceChecks: Array<{
      sourceIdentifier: string;
      status: 'checked' | 'inaccessible' | 'failed';
      checkedAt: string;
      coverageThrough: string | null;
      errorCode: string | null;
      detail: string | null;
    }>;
  }>;
  recentFindings: Array<{
    id: string;
    sourceIdentifier: string;
    sourcePostOrCommentId: string | null;
    sourceUrl: string | null;
    retailerOrOfficialUrl: string | null;
    materialHash: string;
    lastObservedAt: string;
  }>;
};

export class ScoutIngestionValidationError extends Error {
  readonly issues: ScoutImportError[];

  constructor(issues: ScoutImportError[]) {
    super('Scout findings input is invalid.');
    this.name = 'ScoutIngestionValidationError';
    this.issues = issues;
  }
}

export class ScoutRunConflictError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(`Run ID ${runId} was already used with different input.`);
    this.name = 'ScoutRunConflictError';
    this.runId = runId;
  }
}

export function validateScoutImportInput(
  input: unknown,
  now = Date.now(),
): SaveScoutFindingsInput {
  const parsed = saveScoutFindingsInputSchema.safeParse(input);
  if (!parsed.success)
    throw new ScoutIngestionValidationError(
      parsed.error.issues.map((issue) => ({
        index:
          issue.path[0] === 'findings' && typeof issue.path[1] === 'number'
            ? issue.path[1]
            : null,
        code: issue.code,
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  const temporalIssues: ScoutImportError[] = [];
  const startedAt = Date.parse(parsed.data.run.startedAt);
  const finishedAt = Date.parse(parsed.data.run.finishedAt);
  const earliestRunEvent = startedAt - SCOUT_MAX_CLOCK_SKEW_MS;
  const latestRunEvent = finishedAt + SCOUT_MAX_CLOCK_SKEW_MS;
  const latestAllowedEvent = now + SCOUT_MAX_CLOCK_SKEW_MS;
  if (finishedAt - startedAt > SCOUT_MAX_RUN_DURATION_MS)
    temporalIssues.push({
      index: null,
      code: 'run_too_long',
      path: 'run.finishedAt',
      message: 'A research run cannot span more than 24 hours.',
    });
  if (finishedAt > now + SCOUT_MAX_CLOCK_SKEW_MS)
    temporalIssues.push({
      index: null,
      code: 'future_timestamp',
      path: 'run.finishedAt',
      message: 'Run timestamps cannot be more than 10 minutes in the future.',
    });
  parsed.data.run.sourceChecks.forEach((check, index) => {
    const checkedAt = Date.parse(check.checkedAt);
    if (checkedAt > latestAllowedEvent)
      temporalIssues.push({
        index: null,
        code: 'future_timestamp',
        path: `run.sourceChecks.${index}.checkedAt`,
        message:
          'Source check time cannot be more than 10 minutes in the future.',
      });
    else if (checkedAt < earliestRunEvent || checkedAt > latestRunEvent)
      temporalIssues.push({
        index: null,
        code: 'timestamp_outside_run',
        path: `run.sourceChecks.${index}.checkedAt`,
        message: 'Source check time must correspond to this research run.',
      });
    if (
      check.coverageThrough &&
      (Date.parse(check.coverageThrough) >
        checkedAt + SCOUT_MAX_CLOCK_SKEW_MS ||
        Date.parse(check.coverageThrough) > latestAllowedEvent)
    )
      temporalIssues.push({
        index: null,
        code: 'future_coverage',
        path: `run.sourceChecks.${index}.coverageThrough`,
        message: 'Source coverage cannot extend beyond the check time.',
      });
  });
  parsed.data.findings.forEach((finding, index) => {
    const observedAt = Date.parse(finding.observedAt);
    if (observedAt > latestAllowedEvent)
      temporalIssues.push({
        index,
        code: 'future_timestamp',
        path: `findings.${index}.observedAt`,
        message:
          'Finding observation time cannot be more than 10 minutes in the future.',
      });
    else if (observedAt < earliestRunEvent || observedAt > latestRunEvent)
      temporalIssues.push({
        index,
        code: 'timestamp_outside_run',
        path: `findings.${index}.observedAt`,
        message:
          'Finding observation time must correspond to this research run.',
      });
    if (
      finding.publishedAt &&
      (Date.parse(finding.publishedAt) > observedAt + SCOUT_MAX_CLOCK_SKEW_MS ||
        Date.parse(finding.publishedAt) > latestAllowedEvent)
    )
      temporalIssues.push({
        index,
        code: 'future_publication',
        path: `findings.${index}.publishedAt`,
        message: 'Publication time cannot be after the observation time.',
      });
    if (finding.verificationEvidence) {
      const verifiedAt = Date.parse(finding.verificationEvidence.observedAt);
      if (verifiedAt > latestAllowedEvent)
        temporalIssues.push({
          index,
          code: 'future_verification',
          path: `findings.${index}.verificationEvidence.observedAt`,
          message:
            'Verification time cannot be more than 10 minutes in the future.',
        });
      else if (verifiedAt < earliestRunEvent || verifiedAt > latestRunEvent)
        temporalIssues.push({
          index,
          code: 'timestamp_outside_run',
          path: `findings.${index}.verificationEvidence.observedAt`,
          message: 'Verification time must correspond to this research run.',
        });
    }
    const latestMilestone = now + 5 * 366 * 24 * 60 * 60_000;
    for (const [field, value] of [
      ['eventAt', finding.eventAt],
      ['actionOpensAt', finding.actionOpensAt],
      ['actionDeadlineAt', finding.actionDeadlineAt],
    ] as const)
      if (value && Date.parse(value) > latestMilestone)
        temporalIssues.push({
          index,
          code: 'milestone_too_far',
          path: `findings.${index}.${field}`,
          message: `${field} cannot be more than five years in the future.`,
        });
  });
  if (temporalIssues.length)
    throw new ScoutIngestionValidationError(temporalIssues);
  return parsed.data;
}

export function sanitizeScoutSourceCheck(
  sourceCheck: ScoutSourceCheck,
): ScoutSourceCheck {
  return {
    ...sourceCheck,
    errorCode: sourceCheck.errorCode
      ? redactPersonalData(normaliseCommunityText(sourceCheck.errorCode)).slice(
          0,
          100,
        )
      : null,
    detail: sourceCheck.detail
      ? redactPersonalData(normaliseCommunityText(sourceCheck.detail)).slice(
          0,
          500,
        )
      : null,
  };
}

export function sanitizeScoutFinding(
  finding: ScoutFindingInput,
): ScoutFindingInput {
  return {
    ...finding,
    headline: finding.headline
      ? redactPersonalData(normaliseCommunityText(finding.headline)).slice(
          0,
          180,
        )
      : null,
    productName: finding.productName
      ? normaliseCommunityText(finding.productName).slice(0, 240)
      : null,
    productLanguage: finding.productLanguage
      ? normaliseCommunityText(finding.productLanguage).slice(0, 64)
      : null,
    summary: redactPersonalData(normaliseCommunityText(finding.summary)),
    actionInstruction: finding.actionInstruction
      ? redactPersonalData(
          normaliseCommunityText(finding.actionInstruction),
        ).slice(0, 400)
      : null,
    region: finding.region
      ? normaliseCommunityText(finding.region).slice(0, 120)
      : null,
    retailerName: finding.retailerName
      ? normaliseCommunityText(finding.retailerName).slice(0, 160)
      : null,
    sourceUrl: finding.sourceUrl
      ? canonicalizeScoutUrl(finding.sourceUrl)
      : null,
    retailerOrOfficialUrl: finding.retailerOrOfficialUrl
      ? canonicalizeScoutUrl(finding.retailerOrOfficialUrl)
      : null,
    actionUrl: finding.actionUrl
      ? canonicalizeScoutUrl(finding.actionUrl)
      : null,
    verificationEvidence: finding.verificationEvidence
      ? {
          ...finding.verificationEvidence,
          url: canonicalizeScoutUrl(finding.verificationEvidence.url),
          note: finding.verificationEvidence.note
            ? redactPersonalData(
                normaliseCommunityText(finding.verificationEvidence.note),
              )
            : null,
        }
      : null,
    collectionMethod: SCOUT_COLLECTION_METHOD,
  };
}

export function canonicalizeScoutUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of Array.from(url.searchParams.keys()))
    if (
      key.toLocaleLowerCase('en-US').startsWith('utm_') ||
      ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(
        key.toLocaleLowerCase('en-US'),
      )
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

function normalIdentity(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function scoutFindingIdentity(finding: ScoutFindingInput) {
  return {
    sourceKind: finding.sourceKind,
    sourceIdentifier: normalIdentity(finding.sourceIdentifier),
    subreddit: normalIdentity(finding.subreddit),
    sourcePostOrCommentId: normalIdentity(finding.sourcePostOrCommentId),
    sourceUrl: finding.sourceUrl ?? '',
    retailerName: normalIdentity(finding.retailerName),
    retailerOrOfficialUrl: finding.retailerOrOfficialUrl ?? '',
    game: finding.game,
    productName: normalIdentity(finding.productName),
    productLanguage: normalIdentity(finding.productLanguage),
  };
}

export function scoutFindingMaterial(finding: ScoutFindingInput) {
  return {
    ...scoutFindingIdentity(finding),
    updateType: finding.updateType,
    publishedAt: finding.publishedAt,
    eventAt: finding.eventAt,
    actionOpensAt: finding.actionOpensAt,
    actionDeadlineAt: finding.actionDeadlineAt,
    actionType: finding.actionType,
    actionUrl: finding.actionUrl,
    lifecycleStatus: finding.lifecycleStatus,
    priceCents: finding.price === null ? null : Math.round(finding.price * 100),
    currency: finding.currency,
    region: finding.region,
    shippingToNetherlands: finding.shippingToNetherlands,
    availability: finding.availability,
    verificationStatus: finding.verificationStatus,
    verificationEvidenceUrl: finding.verificationEvidence?.url ?? null,
  };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function hashScoutValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function deriveScoutRunStatus(
  sourceChecks: ScoutSourceCheck[],
  rejected: number,
): 'completed' | 'partial' | 'failed' {
  const checked = sourceChecks.filter((check) => check.status === 'checked');
  if (checked.length === sourceChecks.length && rejected === 0)
    return 'completed';
  if (checked.length > 0) return 'partial';
  return 'failed';
}
