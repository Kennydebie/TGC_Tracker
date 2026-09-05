import type { D1Database } from '@cloudflare/workers-types';

import type { RequestUser } from '../server/user.ts';
import {
  deriveScoutRunStatus,
  hashScoutValue,
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
  return result ? { ...result, replayed: true } : null;
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

async function insertObservation(
  db: D1Database,
  entry: PreparedFinding,
  userId: string,
  findingId: string,
  runId: string,
  now: number,
) {
  const idHash = await hashScoutValue({
    userId,
    findingId,
    materialHash: entry.materialHash,
  });
  await db
    .prepare(
      `INSERT INTO scout_finding_observations
        (id, user_id, finding_id, run_id, material_hash, observed_at,
         payload_json, data_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'production', ?, ?)
       ON CONFLICT(user_id, finding_id, material_hash) DO UPDATE SET
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
    )
    .run();
}

async function persistFinding(
  db: D1Database,
  entry: PreparedFinding,
  userId: string,
  runId: string,
  now: number,
): Promise<{ id: string; outcome: 'inserted' | 'updated' | 'unchanged' }> {
  let stored = await db
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
    const result = await db
      .prepare(
        `INSERT INTO scout_findings
          (id, user_id, dedupe_key, source_kind, source_identifier, game,
           product_name, product_language, update_type, summary, source_url,
           subreddit, source_post_or_comment_id, retailer_name,
           retailer_or_official_url, published_at, first_observed_at,
           last_observed_at, price_cents, currency, region,
           shipping_to_netherlands, availability, verification_status,
           verification_evidence_url, verification_observed_at,
           verification_evidence_json, collection_method, material_hash,
           latest_run_id, data_mode, created_at, updated_at)
         VALUES (${Array.from({ length: 33 }, () => '?').join(', ')})
         ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
      )
      .bind(...findingValues(entry, userId, findingId, runId, now))
      .run();
    if (changed(result)) {
      await insertObservation(db, entry, userId, findingId, runId, now);
      return { id: findingId, outcome: 'inserted' };
    }
    stored = await db
      .prepare(
        `SELECT id, material_hash, last_observed_at
         FROM scout_findings
         WHERE user_id = ? AND dedupe_key = ?`,
      )
      .bind(userId, entry.dedupeKey)
      .first<StoredFinding>();
    if (!stored) throw new Error('Unable to resolve concurrent finding write.');
  }
  const observedAt = Date.parse(entry.finding.observedAt);
  if (stored.material_hash === entry.materialHash) {
    await db
      .prepare(
        `UPDATE scout_findings
         SET last_observed_at = MAX(last_observed_at, ?),
             latest_run_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(observedAt, runId, now, stored.id, userId)
      .run();
    await insertObservation(db, entry, userId, stored.id, runId, now);
    return { id: stored.id, outcome: 'unchanged' };
  }
  const finding = entry.finding;
  await db
    .prepare(
      `UPDATE scout_findings SET
         source_kind = ?, source_identifier = ?, game = ?, product_name = ?,
         product_language = ?, update_type = ?, summary = ?, source_url = ?,
         subreddit = ?, source_post_or_comment_id = ?, retailer_name = ?,
         retailer_or_official_url = ?, published_at = ?,
         last_observed_at = MAX(last_observed_at, ?), price_cents = ?,
         currency = ?, region = ?, shipping_to_netherlands = ?,
         availability = ?, verification_status = ?,
         verification_evidence_url = ?, verification_observed_at = ?,
         verification_evidence_json = ?, material_hash = ?, latest_run_id = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      finding.sourceKind,
      finding.sourceIdentifier,
      finding.game,
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
    )
    .run();
  await insertObservation(db, entry, userId, stored.id, runId, now);
  return { id: stored.id, outcome: 'updated' };
}

export async function saveScoutFindings(
  db: D1Database,
  user: RequestUser,
  rawInput: unknown,
  now = Date.now(),
): Promise<SaveScoutFindingsResult> {
  const input = validateScoutImportInput(rawInput);
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
    if (now - Number(existing.updated_at) < 5 * 60_000)
      throw new Error('This run is still being processed; retry shortly.');
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
    await db.batch(
      input.run.sourceChecks.map((check) =>
        db
          .prepare(
            `INSERT INTO scout_ingestion_source_checks
              (id, user_id, run_id, source_identifier, status, checked_at,
               coverage_through, error_code, detail, data_mode, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'production', ?)`,
          )
          .bind(
            `${runId}:source:${input.run.sourceChecks.indexOf(check)}`,
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
      ),
    );
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
    for (const entry of accepted) {
      const persisted = await persistFinding(db, entry, user.id, runId, now);
      result[persisted.outcome] += 1;
      result.recordIds.push(persisted.id);
    }
    await db
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
      )
      .run();
    await db
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
      )
      .run();
    return result;
  } catch (error) {
    const failure: ScoutImportError = {
      index: null,
      code: 'persistence_failed',
      path: '',
      message: 'The import could not be completed. Retry with a new run ID.',
    };
    result.status = 'failed';
    result.errors.push(failure);
    result.rejected += accepted.length - result.recordIds.length;
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
) {
  const state = await getScoutIngestionState(db, user, {
    recentRunLimit: 1,
    recentFindingLimit: 50,
  });
  const rows = await db
    .prepare(
      `SELECT id, game, product_name, product_language, update_type, summary,
              source_url, subreddit, source_post_or_comment_id,
              retailer_or_official_url, published_at, last_observed_at,
              price_cents, currency, region, shipping_to_netherlands,
              availability, verification_status, verification_evidence_url,
              verification_observed_at, collection_method
       FROM scout_findings
       WHERE user_id = ? AND data_mode = 'production'
       ORDER BY last_observed_at DESC
       LIMIT 50`,
    )
    .bind(user.id)
    .all<{
      id: string;
      game: 'pokemon' | 'riftbound';
      product_name: string | null;
      product_language: string | null;
      update_type: ScoutFindingInput['updateType'];
      summary: string;
      source_url: string | null;
      subreddit: string | null;
      source_post_or_comment_id: string | null;
      retailer_or_official_url: string | null;
      published_at: number | null;
      last_observed_at: number;
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
    }>();
  return {
    findings: (rows.results ?? []).map((row) => ({
      id: row.id,
      game: row.game,
      productName: row.product_name,
      productLanguage: row.product_language,
      updateType: row.update_type,
      summary: row.summary,
      sourceUrl: row.source_url,
      subreddit: row.subreddit,
      sourceExternalId: row.source_post_or_comment_id,
      retailerOrOfficialUrl: row.retailer_or_official_url,
      publishedAt: iso(row.published_at),
      observedAt: new Date(row.last_observed_at).toISOString(),
      price: row.price_cents === null ? null : row.price_cents / 100,
      currency: row.currency,
      region: row.region,
      shippingToNetherlands: row.shipping_to_netherlands,
      availability: row.availability,
      verificationStatus: row.verification_status,
      verificationEvidenceUrl: row.verification_evidence_url,
      verificationObservedAt: iso(row.verification_observed_at),
      collectionMethod: row.collection_method,
    })),
    importStatus: {
      lastSuccessfulImportAt: state.lastSuccessfulImportAt,
      lastAttemptAt: state.lastAttemptAt,
      lastRunStatus: state.lastRunStatus,
      actionableError: state.actionableError,
    },
  };
}
