import type { D1Database } from '@cloudflare/workers-types';

import type { ScoutResearchFinding } from '../community.ts';
import type { RequestUser } from '../server/user.ts';
import {
  deriveScoutRunStatus,
  hashScoutValue,
  sanitizeScoutSourceCheck,
  sanitizeScoutFinding,
  SCOUT_COLLECTION_METHOD,
  SCOUT_TRACKED_SOURCES,
  ScoutRunConflictError,
  scoutFindingIdentity,
  scoutFindingMaterial,
  stableStringify,
  validateScoutImportInput,
  type SaveScoutFindingsInput,
  type SaveScoutFindingsResult,
  type ScoutFindingInput,
  type ScoutImportError,
  type ScoutIngestionState,
} from '../scout-ingestion.ts';
import { ensureUser } from './user-state.ts';

type StoredRun = {
  id: string;
  payload_hash: string;
  result_json: string;
  updated_at: number;
};

type StoredFinding = {
  id: string;
  material_hash: string;
  last_observed_at: number;
};

type PreparedFinding = {
  index: number;
  finding: ScoutFindingInput;
  dedupeKey: string;
  materialHash: string;
};

type PreparedStatement = ReturnType<D1Database['prepare']>;

type ScoutDashboardRow = {
  id: string;
  source_kind: ScoutFindingInput['sourceKind'];
  source_identifier: string;
  game: 'pokemon' | 'riftbound';
  headline: string | null;
  product_name: string | null;
  product_language: string | null;
  update_type: ScoutFindingInput['updateType'];
  summary: string;
  source_url: string | null;
  subreddit: string | null;
  source_post_or_comment_id: string | null;
  retailer_name: string | null;
  retailer_or_official_url: string | null;
  published_at: number | null;
  event_at: string | null;
  action_opens_at: string | null;
  action_deadline_at: string | null;
  action_type: ScoutFindingInput['actionType'];
  action_instruction: string | null;
  action_url: string | null;
  lifecycle_status: ScoutFindingInput['lifecycleStatus'];
  last_observed_at: number;
  material_changed_at: number;
  price_cents: number | null;
  currency: 'EUR' | 'GBP' | 'USD' | null;
  region: string | null;
  shipping_to_netherlands: 'confirmed' | 'unavailable' | 'unknown';
  availability: 'in_stock' | 'preorder' | 'sold_out' | 'unknown';
  verification_status:
    | 'community_report'
    | 'retailer_checked'
    | 'official_checked';
  verification_evidence_url: string | null;
  verification_observed_at: number | null;
  collection_method: typeof SCOUT_COLLECTION_METHOD;
};

type ScoutRoadmapRow = ScoutDashboardRow & {
  roadmap_total: number;
};

const SCOUT_RUN_LEASE_MS = 5 * 60_000;

function changed(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes ?? 0) > 0;
}

function parseStoredResult(value: string): SaveScoutFindingsResult | null {
  try {
    const parsed = JSON.parse(value) as SaveScoutFindingsResult;
    return parsed?.runId ? parsed : null;
  } catch {
    return null;
  }
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function mapScoutDashboardRow(row: ScoutDashboardRow): ScoutResearchFinding {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceIdentifier: row.source_identifier,
    game: row.game,
    headline: row.headline,
    productName: row.product_name,
    productLanguage: row.product_language,
    updateType: row.update_type,
    summary: row.summary,
    sourceUrl: row.source_url,
    subreddit: row.subreddit,
    sourceExternalId: row.source_post_or_comment_id,
    retailerName: row.retailer_name,
    retailerOrOfficialUrl: row.retailer_or_official_url,
    publishedAt: iso(row.published_at),
    observedAt: new Date(row.last_observed_at).toISOString(),
    materialChangedAt: new Date(row.material_changed_at).toISOString(),
    eventAt: row.event_at,
    actionOpensAt: row.action_opens_at,
    actionDeadlineAt: row.action_deadline_at,
    actionType: row.action_type,
    actionInstruction: row.action_instruction,
    actionUrl: row.action_url,
    lifecycleStatus: row.lifecycle_status,
    price: row.price_cents === null ? null : row.price_cents / 100,
    currency: row.currency,
    region: row.region,
    shippingToNetherlands: row.shipping_to_netherlands,
    availability: row.availability,
    verificationStatus: row.verification_status,
    verificationEvidenceUrl: row.verification_evidence_url,
    verificationObservedAt: iso(row.verification_observed_at),
    collectionMethod: row.collection_method,
  };
}

function amsterdamDateKey(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function amsterdamLocalMidnightEpoch(
  year: number,
  monthIndex: number,
  day: number,
): number {
  const utcGuess = Date.UTC(year, monthIndex, day);
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Amsterdam',
  }).formatToParts(new Date(utcGuess));
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const zoneOffsetAtGuess =
    Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour,
      value.minute,
      value.second,
    ) - utcGuess;
  return utcGuess - zoneOffsetAtGuess;
}

function milestoneSortAt(value: string | null): number | null {
  if (!value) return null;
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value,
  );
}

async function prepareFindings(
  findings: ScoutFindingInput[],
): Promise<PreparedFinding[]> {
  return Promise.all(
    findings.map(async (rawFinding, index) => {
      const finding = sanitizeScoutFinding(rawFinding);
      return {
        index,
        finding,
        dedupeKey: await hashScoutValue(scoutFindingIdentity(finding)),
        materialHash: await hashScoutValue(scoutFindingMaterial(finding)),
      };
    }),
  );
}

function businessValidate(
  entries: PreparedFinding[],
  input: SaveScoutFindingsInput,
): { accepted: PreparedFinding[]; errors: ScoutImportError[] } {
  const checkedSources = new Set(
    input.run.sourceChecks
      .filter((check) => check.status === 'checked')
      .map((check) => check.sourceIdentifier.toLocaleLowerCase('en-US')),
  );
  const seen = new Set<string>();
  const errors: ScoutImportError[] = [];
  const accepted: PreparedFinding[] = [];
  for (const entry of entries) {
    if (
      !checkedSources.has(
        entry.finding.sourceIdentifier.toLocaleLowerCase('en-US'),
      )
    ) {
      errors.push({
        index: entry.index,
        code: 'source_not_checked',
        path: `findings.${entry.index}.sourceIdentifier`,
        message:
          'The finding source must have a checked source entry in this run.',
      });
      continue;
    }
    if (seen.has(entry.dedupeKey)) {
      errors.push({
        index: entry.index,
        code: 'duplicate_in_batch',
        path: `findings.${entry.index}`,
        message:
          'The same source finding appears more than once in this batch.',
      });
      continue;
    }
    seen.add(entry.dedupeKey);
    accepted.push(entry);
  }
  return { accepted, errors };
}

async function findStoredRun(
  db: D1Database,
  userId: string,
  externalRunId: string,
) {
  return db
    .prepare(
      `SELECT id, payload_hash, result_json, updated_at
       FROM scout_ingestion_runs
       WHERE user_id = ? AND external_run_id = ?`,
    )
    .bind(userId, externalRunId)
    .first<StoredRun>();
}

async function replayOrConflict(
  stored: StoredRun,
  externalRunId: string,
  payloadHash: string,
): Promise<SaveScoutFindingsResult | null> {
  if (stored.payload_hash !== payloadHash)
    throw new ScoutRunConflictError(externalRunId);
  const result = parseStoredResult(stored.result_json);
  if (result?.errors.some((error) => error.code === 'persistence_failed'))
    return null;
  return result ? { ...result, replayed: true } : null;
}

function isRetryablePersistenceFailure(stored: StoredRun): boolean {
  return Boolean(
    parseStoredResult(stored.result_json)?.errors.some(
      (error) => error.code === 'persistence_failed',
    ),
  );
}

async function claimStoredRun(
  db: D1Database,
  stored: StoredRun,
  userId: string,
  now: number,
): Promise<boolean> {
  const claimed = await db
    .prepare(
      `UPDATE scout_ingestion_runs
       SET result_json = '{}', updated_at = ?
       WHERE id = ? AND user_id = ? AND result_json = ? AND updated_at = ?`,
    )
    .bind(now, stored.id, userId, stored.result_json, stored.updated_at)
    .run();
  return changed(claimed);
}

function findingValues(
  entry: PreparedFinding,
  userId: string,
  findingId: string,
  runId: string,
  now: number,
) {
  const finding = entry.finding;
  return [
    findingId,
    userId,
    entry.dedupeKey,
    finding.sourceKind,
    finding.sourceIdentifier,
    finding.game,
    finding.headline,
    finding.productName,
    finding.productLanguage,
    finding.updateType,
    finding.summary,
    finding.sourceUrl,
    finding.subreddit,
    finding.sourcePostOrCommentId,
    finding.retailerName,
    finding.retailerOrOfficialUrl,
    finding.publishedAt ? Date.parse(finding.publishedAt) : null,
    finding.eventAt,
    finding.actionOpensAt,
    finding.actionDeadlineAt,
    milestoneSortAt(finding.eventAt),
    milestoneSortAt(finding.actionOpensAt),
    milestoneSortAt(finding.actionDeadlineAt),
    finding.actionType,
    finding.actionInstruction,
    finding.actionUrl,
    finding.lifecycleStatus,
    Date.parse(finding.observedAt),
    Date.parse(finding.observedAt),
    Date.parse(finding.observedAt),
    finding.price === null ? null : Math.round(finding.price * 100),
    finding.currency,
    finding.region,
    finding.shippingToNetherlands,
    finding.availability,
    finding.verificationStatus,
    finding.verificationEvidence?.url ?? null,
    finding.verificationEvidence
      ? Date.parse(finding.verificationEvidence.observedAt)
      : null,
    finding.verificationEvidence
      ? JSON.stringify(finding.verificationEvidence)
      : null,
    SCOUT_COLLECTION_METHOD,
    entry.materialHash,
    runId,
    'production',
    now,
    now,
  ] as const;
}

async function prepareObservation(
  db: D1Database,
  entry: PreparedFinding,
  userId: string,
  findingId: string,
  runId: string,
  now: number,
): Promise<PreparedStatement> {
  const idHash = await hashScoutValue({
    userId,
    findingId,
    materialHash: entry.materialHash,
  });
  return db
    .prepare(
      `INSERT INTO scout_finding_observations
        (id, user_id, finding_id, run_id, material_hash, observed_at,
         payload_json, data_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'production', ?, ?)
       ON CONFLICT(user_id, finding_id, material_hash) DO UPDATE SET
         run_id = CASE
           WHEN excluded.observed_at >= scout_finding_observations.observed_at
             THEN excluded.run_id ELSE scout_finding_observations.run_id END,
         payload_json = CASE
           WHEN excluded.observed_at >= scout_finding_observations.observed_at
             THEN excluded.payload_json ELSE scout_finding_observations.payload_json END,
         observed_at = MAX(observed_at, excluded.observed_at),
         updated_at = excluded.updated_at`,
    )
    .bind(
      `scout-observation:${idHash.slice(0, 40)}`,
      userId,
      findingId,
      runId,
      entry.materialHash,
      Date.parse(entry.finding.observedAt),
      JSON.stringify(entry.finding),
      now,
      now,
    );
}

async function prepareFindingMutation(
  db: D1Database,
  entry: PreparedFinding,
  userId: string,
  runId: string,
  now: number,
): Promise<{
  id: string;
  outcome: 'inserted' | 'updated' | 'unchanged';
  statements: PreparedStatement[];
}> {
  const stored = await db
    .prepare(
      `SELECT id, material_hash, last_observed_at
       FROM scout_findings
       WHERE user_id = ? AND dedupe_key = ?`,
    )
    .bind(userId, entry.dedupeKey)
    .first<StoredFinding>();
  const userFindingHash = await hashScoutValue({
    userId,
    dedupeKey: entry.dedupeKey,
  });
  const findingId =
    stored?.id ?? `scout-finding:${userFindingHash.slice(0, 40)}`;
  if (!stored) {
    const insert = db
      .prepare(
        `INSERT INTO scout_findings
          (id, user_id, dedupe_key, source_kind, source_identifier, game,
           headline, product_name, product_language, update_type, summary,
           source_url, subreddit, source_post_or_comment_id, retailer_name,
           retailer_or_official_url, published_at, event_at, action_opens_at,
           action_deadline_at, event_sort_at, action_opens_sort_at,
           action_deadline_sort_at, action_type, action_instruction,
           action_url, lifecycle_status, first_observed_at, last_observed_at,
           material_changed_at, price_cents, currency, region,
           shipping_to_netherlands, availability, verification_status,
           verification_evidence_url, verification_observed_at,
           verification_evidence_json, collection_method, material_hash,
           latest_run_id, data_mode, created_at, updated_at)
         VALUES (${Array.from({ length: 45 }, () => '?').join(', ')})
         ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
      )
      .bind(...findingValues(entry, userId, findingId, runId, now));
    return {
      id: findingId,
      outcome: 'inserted',
      statements: [
        insert,
        await prepareObservation(db, entry, userId, findingId, runId, now),
      ],
    };
  }
  const finding = entry.finding;
  const observedAt = Date.parse(finding.observedAt);
  if (stored.material_hash === entry.materialHash) {
    const update = db
      .prepare(
        `UPDATE scout_findings
         SET last_observed_at = MAX(last_observed_at, ?),
             latest_run_id = CASE
               WHEN ? >= last_observed_at THEN ? ELSE latest_run_id END,
             headline = CASE
               WHEN ? >= last_observed_at THEN ? ELSE headline END,
             summary = CASE
               WHEN ? >= last_observed_at THEN ? ELSE summary END,
             action_instruction = CASE
               WHEN ? >= last_observed_at THEN ? ELSE action_instruction END,
             verification_evidence_url = CASE
               WHEN ? >= last_observed_at THEN ? ELSE verification_evidence_url END,
             verification_observed_at = CASE
               WHEN ? >= last_observed_at THEN ? ELSE verification_observed_at END,
             verification_evidence_json = CASE
               WHEN ? >= last_observed_at THEN ? ELSE verification_evidence_json END,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        observedAt,
        observedAt,
        runId,
        observedAt,
        finding.headline,
        observedAt,
        finding.summary,
        observedAt,
        finding.actionInstruction,
        observedAt,
        finding.verificationEvidence?.url ?? null,
        observedAt,
        finding.verificationEvidence
          ? Date.parse(finding.verificationEvidence.observedAt)
          : null,
        observedAt,
        finding.verificationEvidence
          ? JSON.stringify(finding.verificationEvidence)
          : null,
        now,
        stored.id,
        userId,
      );
    return {
      id: stored.id,
      outcome: 'unchanged',
      statements: [
        update,
        await prepareObservation(db, entry, userId, stored.id, runId, now),
      ],
    };
  }
  if (observedAt < stored.last_observed_at)
    return {
      id: stored.id,
      outcome: 'unchanged',
      statements: [
        await prepareObservation(db, entry, userId, stored.id, runId, now),
      ],
    };
  const update = db
    .prepare(
      `UPDATE scout_findings SET
         source_kind = ?, source_identifier = ?, game = ?, headline = ?,
         product_name = ?, product_language = ?, update_type = ?, summary = ?,
         source_url = ?, subreddit = ?, source_post_or_comment_id = ?,
         retailer_name = ?, retailer_or_official_url = ?, published_at = ?,
         event_at = ?, action_opens_at = ?, action_deadline_at = ?,
         event_sort_at = ?, action_opens_sort_at = ?,
         action_deadline_sort_at = ?, action_type = ?, action_instruction = ?,
         action_url = ?,
         lifecycle_status = ?, last_observed_at = MAX(last_observed_at, ?),
         material_changed_at = ?, price_cents = ?, currency = ?, region = ?,
         shipping_to_netherlands = ?, availability = ?, verification_status = ?,
         verification_evidence_url = ?, verification_observed_at = ?,
         verification_evidence_json = ?, material_hash = ?, latest_run_id = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ? AND ? >= last_observed_at`,
    )
    .bind(
      finding.sourceKind,
      finding.sourceIdentifier,
      finding.game,
      finding.headline,
      finding.productName,
      finding.productLanguage,
      finding.updateType,
      finding.summary,
      finding.sourceUrl,
      finding.subreddit,
      finding.sourcePostOrCommentId,
      finding.retailerName,
      finding.retailerOrOfficialUrl,
      finding.publishedAt ? Date.parse(finding.publishedAt) : null,
      finding.eventAt,
      finding.actionOpensAt,
      finding.actionDeadlineAt,
      milestoneSortAt(finding.eventAt),
      milestoneSortAt(finding.actionOpensAt),
      milestoneSortAt(finding.actionDeadlineAt),
      finding.actionType,
      finding.actionInstruction,
      finding.actionUrl,
      finding.lifecycleStatus,
      observedAt,
      observedAt,
      finding.price === null ? null : Math.round(finding.price * 100),
      finding.currency,
      finding.region,
      finding.shippingToNetherlands,
      finding.availability,
      finding.verificationStatus,
      finding.verificationEvidence?.url ?? null,
      finding.verificationEvidence
        ? Date.parse(finding.verificationEvidence.observedAt)
        : null,
      finding.verificationEvidence
        ? JSON.stringify(finding.verificationEvidence)
        : null,
      entry.materialHash,
      runId,
      now,
      stored.id,
      userId,
      observedAt,
    );
  return {
    id: stored.id,
    outcome: 'updated',
    statements: [
      update,
      await prepareObservation(db, entry, userId, stored.id, runId, now),
    ],
  };
}

export async function saveScoutFindings(
  db: D1Database,
  user: RequestUser,
  rawInput: unknown,
  now = Date.now(),
): Promise<SaveScoutFindingsResult> {
  const validated = validateScoutImportInput(rawInput, now);
  const input: SaveScoutFindingsInput = {
    ...validated,
    run: {
      ...validated.run,
      sourceChecks: validated.run.sourceChecks.map(sanitizeScoutSourceCheck),
    },
  };
  const entries = await prepareFindings(input.findings);
  const { accepted, errors } = businessValidate(entries, input);
  const status = deriveScoutRunStatus(input.run.sourceChecks, errors.length);
  const canonicalPayload = {
    run: {
      ...input.run,
      sourceChecks: [...input.run.sourceChecks].sort((a, b) =>
        a.sourceIdentifier.localeCompare(b.sourceIdentifier),
      ),
    },
    findings: entries
      .map((entry) => entry.finding)
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  };
  const payloadHash = await hashScoutValue(canonicalPayload);
  await ensureUser(db, user);
  const existing = await findStoredRun(db, user.id, input.run.id);
  if (existing) {
    const replay = await replayOrConflict(existing, input.run.id, payloadHash);
    if (replay) return replay;
    const retryableFailure = isRetryablePersistenceFailure(existing);
    const leaseExpired =
      now - Number(existing.updated_at) >= SCOUT_RUN_LEASE_MS;
    if (!retryableFailure && !leaseExpired)
      throw new Error('This run is still being processed; retry shortly.');
    if (!(await claimStoredRun(db, existing, user.id, now))) {
      const raced = await findStoredRun(db, user.id, input.run.id);
      if (raced) {
        const racedReplay = await replayOrConflict(
          raced,
          input.run.id,
          payloadHash,
        );
        if (racedReplay) return racedReplay;
      }
      throw new Error('This run is already being retried; retry shortly.');
    }
  }
  const runHash = await hashScoutValue({
    userId: user.id,
    runId: input.run.id,
  });
  const runId = existing?.id ?? `scout-run:${runHash.slice(0, 40)}`;
  if (!existing) {
    const reservation = await db
      .prepare(
        `INSERT INTO scout_ingestion_runs
          (id, user_id, external_run_id, payload_hash, status, started_at,
           finished_at, findings_received, inserted_count, updated_count,
           unchanged_count, rejected_count, errors_json, result_json,
           data_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, '{}', 'production', ?, ?)
         ON CONFLICT(user_id, external_run_id) DO NOTHING`,
      )
      .bind(
        runId,
        user.id,
        input.run.id,
        payloadHash,
        status,
        Date.parse(input.run.startedAt),
        Date.parse(input.run.finishedAt),
        input.findings.length,
        errors.length,
        JSON.stringify(errors),
        now,
        now,
      )
      .run();
    if (!changed(reservation)) {
      const raced = await findStoredRun(db, user.id, input.run.id);
      if (!raced) throw new Error('Unable to reserve ingestion run.');
      const replay = await replayOrConflict(raced, input.run.id, payloadHash);
      if (replay) return replay;
      throw new Error('This run is already being processed; retry shortly.');
    }
  }
  const result: SaveScoutFindingsResult = {
    runId: input.run.id,
    status,
    replayed: false,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rejected: errors.length,
    recordIds: [],
    errors,
  };
  try {
    const statements: PreparedStatement[] = input.run.sourceChecks.map(
      (check, index) =>
        db
          .prepare(
            `INSERT INTO scout_ingestion_source_checks
              (id, user_id, run_id, source_identifier, status, checked_at,
               coverage_through, error_code, detail, data_mode, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'production', ?)
             ON CONFLICT(user_id, run_id, source_identifier) DO NOTHING`,
          )
          .bind(
            `${runId}:source:${index}`,
            user.id,
            runId,
            check.sourceIdentifier,
            check.status,
            Date.parse(check.checkedAt),
            check.coverageThrough ? Date.parse(check.coverageThrough) : null,
            check.errorCode,
            check.detail,
            now,
          ),
    );
    for (const entry of accepted) {
      const mutation = await prepareFindingMutation(
        db,
        entry,
        user.id,
        runId,
        now,
      );
      result[mutation.outcome] += 1;
      result.recordIds.push(mutation.id);
      statements.push(...mutation.statements);
    }
    statements.push(
      db
        .prepare(
          `UPDATE scout_ingestion_runs SET
             status = ?, inserted_count = ?, updated_count = ?,
             unchanged_count = ?, rejected_count = ?, errors_json = ?,
             result_json = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(
          result.status,
          result.inserted,
          result.updated,
          result.unchanged,
          result.rejected,
          JSON.stringify(result.errors),
          JSON.stringify(result),
          now,
          runId,
          user.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
            (id, user_id, action, target_type, target_id, metadata_json, created_at)
           VALUES (?, ?, 'scout_findings_imported', 'scout_ingestion_run', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          runId,
          JSON.stringify({
            status: result.status,
            inserted: result.inserted,
            updated: result.updated,
            unchanged: result.unchanged,
            rejected: result.rejected,
            collectionMethod: SCOUT_COLLECTION_METHOD,
          }),
          now,
        ),
    );
    await db.batch(statements);
    return result;
  } catch (error) {
    const failure: ScoutImportError = {
      index: null,
      code: 'persistence_failed',
      path: '',
      message:
        'The import could not be completed. Retry with the same run ID and identical input.',
    };
    result.status = 'failed';
    result.inserted = 0;
    result.updated = 0;
    result.unchanged = 0;
    result.recordIds = [];
    result.errors = [...errors, failure];
    result.rejected = errors.length + accepted.length;
    await db
      .prepare(
        `UPDATE scout_ingestion_runs SET status = 'failed', inserted_count = ?,
         updated_count = ?, unchanged_count = ?, rejected_count = ?,
         errors_json = ?, result_json = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        result.inserted,
        result.updated,
        result.unchanged,
        result.rejected,
        JSON.stringify(result.errors),
        JSON.stringify(result),
        now,
        runId,
        user.id,
      )
      .run();
    throw error;
  }
}

type RunRow = {
  id: string;
  external_run_id: string;
  status: 'completed' | 'partial' | 'failed';
  finished_at: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  rejected_count: number;
  errors_json: string;
};

type CheckRow = {
  source_identifier: string;
  status: 'checked' | 'inaccessible' | 'failed';
  checked_at: number;
  coverage_through: number | null;
  error_code: string | null;
  detail: string | null;
};

export async function getScoutIngestionState(
  db: D1Database,
  user: RequestUser,
  options: { recentRunLimit?: number; recentFindingLimit?: number } = {},
): Promise<ScoutIngestionState> {
  const runLimit = Math.max(1, Math.min(20, options.recentRunLimit ?? 8));
  const findingLimit = Math.max(
    1,
    Math.min(100, options.recentFindingLimit ?? 40),
  );
  const runRows = await db
    .prepare(
      `SELECT id, external_run_id, status, finished_at, inserted_count,
              updated_count, unchanged_count, rejected_count, errors_json
       FROM scout_ingestion_runs
       WHERE user_id = ? AND data_mode = 'production'
       ORDER BY finished_at DESC
       LIMIT ?`,
    )
    .bind(user.id, runLimit)
    .all<RunRow>();
  const recentRuns = [] as ScoutIngestionState['recentRuns'];
  for (const row of runRows.results ?? []) {
    const checks = await db
      .prepare(
        `SELECT source_identifier, status, checked_at, coverage_through,
                error_code, detail
         FROM scout_ingestion_source_checks
         WHERE user_id = ? AND run_id = ?
         ORDER BY source_identifier`,
      )
      .bind(user.id, row.id)
      .all<CheckRow>();
    recentRuns.push({
      runId: row.external_run_id,
      status: row.status,
      finishedAt: new Date(row.finished_at).toISOString(),
      inserted: row.inserted_count,
      updated: row.updated_count,
      unchanged: row.unchanged_count,
      rejected: row.rejected_count,
      sourceChecks: (checks.results ?? []).map((check) => ({
        sourceIdentifier: check.source_identifier,
        status: check.status,
        checkedAt: new Date(check.checked_at).toISOString(),
        coverageThrough: iso(check.coverage_through),
        errorCode: check.error_code,
        detail: check.detail,
      })),
    });
  }
  const successful = await db
    .prepare(
      `SELECT MAX(finished_at) AS finished_at
       FROM scout_ingestion_runs
       WHERE user_id = ? AND status = 'completed' AND data_mode = 'production'`,
    )
    .bind(user.id)
    .first<{ finished_at: number | null }>();
  const findings = await db
    .prepare(
      `SELECT id, source_identifier, source_post_or_comment_id, source_url,
              retailer_or_official_url, material_hash, last_observed_at
       FROM scout_findings
       WHERE user_id = ? AND data_mode = 'production'
       ORDER BY last_observed_at DESC
       LIMIT ?`,
    )
    .bind(user.id, findingLimit)
    .all<{
      id: string;
      source_identifier: string;
      source_post_or_comment_id: string | null;
      source_url: string | null;
      retailer_or_official_url: string | null;
      material_hash: string;
      last_observed_at: number;
    }>();
  const latest = (runRows.results ?? [])[0] ?? null;
  let actionableError: string | null = null;
  if (latest && latest.status !== 'completed') {
    try {
      const runErrors = JSON.parse(latest.errors_json) as ScoutImportError[];
      actionableError = runErrors[0]?.message ?? null;
    } catch {
      actionableError = null;
    }
    if (!actionableError) {
      const failedCheck = recentRuns[0]?.sourceChecks.find(
        (check) => check.status !== 'checked',
      );
      actionableError =
        failedCheck?.detail ??
        (failedCheck
          ? `${failedCheck.sourceIdentifier} was ${failedCheck.status}.`
          : 'The latest research import did not complete.');
    }
  }
  return {
    collectionMethod: SCOUT_COLLECTION_METHOD,
    trackedSources: SCOUT_TRACKED_SOURCES.map((source) => ({ ...source })),
    lastSuccessfulImportAt: iso(successful?.finished_at ?? null),
    lastAttemptAt: latest ? new Date(latest.finished_at).toISOString() : null,
    lastRunStatus: latest?.status ?? null,
    actionableError,
    recentRuns,
    recentFindings: (findings.results ?? []).map((finding) => ({
      id: finding.id,
      sourceIdentifier: finding.source_identifier,
      sourcePostOrCommentId: finding.source_post_or_comment_id,
      sourceUrl: finding.source_url,
      retailerOrOfficialUrl: finding.retailer_or_official_url,
      materialHash: finding.material_hash,
      lastObservedAt: new Date(finding.last_observed_at).toISOString(),
    })),
  };
}

export async function listScoutResearchDashboard(
  db: D1Database,
  user: RequestUser,
  now = Date.now(),
) {
  const state = await getScoutIngestionState(db, user, {
    recentRunLimit: 1,
    recentFindingLimit: 50,
  });
  const milestoneDateFloor = amsterdamDateKey(now);
  const currentAmsterdamYear = Number(milestoneDateFloor.slice(0, 4));
  const currentAmsterdamMonth = Number(milestoneDateFloor.slice(5, 7));
  const roadmapAnchorYear =
    currentAmsterdamMonth >= 7
      ? currentAmsterdamYear
      : currentAmsterdamYear - 1;
  const roadmapDateFloor = `${roadmapAnchorYear}-07-01`;
  const roadmapEpochFloor = amsterdamLocalMidnightEpoch(
    roadmapAnchorYear,
    6,
    1,
  );
  const rows = await db
    .prepare(
      `WITH recent AS (
         SELECT id
         FROM scout_findings
         WHERE user_id = ? AND data_mode = 'production'
         ORDER BY last_observed_at DESC
         LIMIT 50
       ), future_milestones AS (
         SELECT id, MIN(milestone) AS next_at
         FROM (
           SELECT id, event_sort_at AS milestone
           FROM scout_findings
           WHERE user_id = ? AND data_mode = 'production'
             AND ((length(event_at) = 10 AND event_at >= ?)
               OR (length(event_at) > 10 AND event_sort_at >= ?))
           UNION ALL
           SELECT id, action_opens_sort_at AS milestone
           FROM scout_findings
           WHERE user_id = ? AND data_mode = 'production'
             AND ((length(action_opens_at) = 10 AND action_opens_at >= ?)
               OR (length(action_opens_at) > 10 AND action_opens_sort_at >= ?))
           UNION ALL
           SELECT id, action_deadline_sort_at AS milestone
           FROM scout_findings
           WHERE user_id = ? AND data_mode = 'production'
             AND ((length(action_deadline_at) = 10 AND action_deadline_at >= ?)
               OR (length(action_deadline_at) > 10 AND action_deadline_sort_at >= ?))
         )
         GROUP BY id
         ORDER BY next_at ASC
         LIMIT 100
       ), active_windows AS (
         SELECT id
         FROM scout_findings
         WHERE user_id = ? AND data_mode = 'production'
           AND lifecycle_status IN ('registration_open', 'preorder_open', 'in_stock')
         ORDER BY last_observed_at DESC
         LIMIT 50
       ), candidate_ids AS (
         SELECT id FROM recent
         UNION
         SELECT id FROM future_milestones
         UNION
         SELECT id FROM active_windows
       )
       SELECT id, source_kind, source_identifier, game, headline, product_name,
              product_language, update_type, summary, source_url, subreddit,
              source_post_or_comment_id, retailer_name,
              retailer_or_official_url, published_at, event_at,
              action_opens_at, action_deadline_at, action_type,
              action_instruction, action_url, lifecycle_status,
              last_observed_at,
              COALESCE(material_changed_at, first_observed_at) AS material_changed_at,
              price_cents, currency, region, shipping_to_netherlands,
              availability, verification_status, verification_evidence_url,
              verification_observed_at, collection_method
       FROM scout_findings
       WHERE user_id = ? AND data_mode = 'production'
         AND id IN (SELECT id FROM candidate_ids)
       ORDER BY last_observed_at DESC
       LIMIT 200`,
    )
    .bind(
      user.id,
      user.id,
      milestoneDateFloor,
      now,
      user.id,
      milestoneDateFloor,
      now,
      user.id,
      milestoneDateFloor,
      now,
      user.id,
      user.id,
    )
    .all<ScoutDashboardRow>();
  const roadmapRows = await db
    .prepare(
      `WITH roadmap_milestones AS (
         SELECT id, event_sort_at AS milestone
         FROM scout_findings
         WHERE user_id = ? AND data_mode = 'production'
           AND ((length(event_at) = 10 AND event_at >= ?)
             OR (length(event_at) > 10 AND event_sort_at >= ?))
         UNION ALL
         SELECT id, action_opens_sort_at AS milestone
         FROM scout_findings
         WHERE user_id = ? AND data_mode = 'production'
           AND ((length(action_opens_at) = 10 AND action_opens_at >= ?)
             OR (length(action_opens_at) > 10 AND action_opens_sort_at >= ?))
         UNION ALL
         SELECT id, action_deadline_sort_at AS milestone
         FROM scout_findings
         WHERE user_id = ? AND data_mode = 'production'
           AND ((length(action_deadline_at) = 10 AND action_deadline_at >= ?)
             OR (length(action_deadline_at) > 10 AND action_deadline_sort_at >= ?))
       ), roadmap_ids AS (
         SELECT id, MIN(milestone) AS first_milestone,
                MAX(milestone) AS last_milestone
         FROM roadmap_milestones
         GROUP BY id
       ), earliest_ids AS (
         SELECT id, first_milestone, last_milestone
         FROM roadmap_ids
         ORDER BY first_milestone ASC, id ASC
         LIMIT 1000
       ), latest_non_cancelled_id AS (
         SELECT roadmap_ids.id, roadmap_ids.first_milestone,
                roadmap_ids.last_milestone
         FROM roadmap_ids
         INNER JOIN scout_findings AS latest_finding
           ON latest_finding.id = roadmap_ids.id
         WHERE latest_finding.user_id = ?
           AND latest_finding.data_mode = 'production'
           AND latest_finding.lifecycle_status <> 'cancelled'
         ORDER BY roadmap_ids.last_milestone DESC, roadmap_ids.id DESC
         LIMIT 1
       ), selected_ids AS (
         SELECT id, first_milestone, last_milestone FROM earliest_ids
         UNION
         SELECT id, first_milestone, last_milestone
         FROM latest_non_cancelled_id
       )
       SELECT finding.id, finding.source_kind, finding.source_identifier,
              finding.game, finding.headline, finding.product_name,
              finding.product_language, finding.update_type, finding.summary,
              finding.source_url, finding.subreddit,
              finding.source_post_or_comment_id, finding.retailer_name,
              finding.retailer_or_official_url, finding.published_at,
              finding.event_at, finding.action_opens_at,
              finding.action_deadline_at, finding.action_type,
              finding.action_instruction, finding.action_url,
              finding.lifecycle_status, finding.last_observed_at,
              COALESCE(finding.material_changed_at, finding.first_observed_at)
                AS material_changed_at,
              finding.price_cents, finding.currency, finding.region,
              finding.shipping_to_netherlands, finding.availability,
              finding.verification_status,
              finding.verification_evidence_url,
              finding.verification_observed_at, finding.collection_method,
              (SELECT COUNT(*) FROM roadmap_ids) AS roadmap_total
       FROM scout_findings AS finding
       INNER JOIN selected_ids ON selected_ids.id = finding.id
       WHERE finding.user_id = ? AND finding.data_mode = 'production'
       ORDER BY selected_ids.first_milestone ASC, finding.id ASC`,
    )
    .bind(
      user.id,
      roadmapDateFloor,
      roadmapEpochFloor,
      user.id,
      roadmapDateFloor,
      roadmapEpochFloor,
      user.id,
      roadmapDateFloor,
      roadmapEpochFloor,
      user.id,
      user.id,
    )
    .all<ScoutRoadmapRow>();
  const allRoadmapRows = roadmapRows.results ?? [];
  const roadmapTotal = Number(allRoadmapRows[0]?.roadmap_total ?? 0);
  const roadmapCoverageLimited = roadmapTotal > allRoadmapRows.length;
  return {
    findings: (rows.results ?? []).map(mapScoutDashboardRow),
    roadmapFindings: allRoadmapRows.map(mapScoutDashboardRow),
    roadmapCoverageLimited,
    importStatus: {
      lastSuccessfulImportAt: state.lastSuccessfulImportAt,
      lastAttemptAt: state.lastAttemptAt,
      lastRunStatus: state.lastRunStatus,
      actionableError: state.actionableError,
      latestRun: state.recentRuns[0]
        ? {
            finishedAt: state.recentRuns[0].finishedAt,
            inserted: state.recentRuns[0].inserted,
            updated: state.recentRuns[0].updated,
            unchanged: state.recentRuns[0].unchanged,
            rejected: state.recentRuns[0].rejected,
            sourcesChecked: state.recentRuns[0].sourceChecks.filter(
              (check) => check.status === 'checked',
            ).length,
            sourcesUnavailable: state.recentRuns[0].sourceChecks.filter(
              (check) => check.status !== 'checked',
            ).length,
          }
        : null,
    },
  };
}
