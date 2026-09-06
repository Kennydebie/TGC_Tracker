import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  getScoutIngestionState,
  listScoutResearchDashboard,
  saveScoutFindings,
} from '../../lib/repositories/scout-ingestion.ts';
import type { SaveScoutFindingsInput } from '../../lib/scout-ingestion.ts';
import type { RequestUser } from '../../lib/server/user.ts';

type SqlValue = string | number | null;

type BatchFailure = {
  call: number;
  afterStatements: number;
};

const userA: RequestUser = {
  id: 'user-a',
  email: 'a@example.test',
  displayName: 'User A',
};
const userB: RequestUser = {
  id: 'user-b',
  email: 'b@example.test',
  displayName: 'User B',
};

function applyMigrations(database: DatabaseSync) {
  for (const file of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    const migration = readFileSync(`drizzle/${file}`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
  database.exec('PRAGMA foreign_keys = ON');
}

function asD1(database: DatabaseSync, batchFailure?: BatchFailure) {
  let batchCalls = 0;
  let failureInjected = false;
  const result = {
    prepare(sql: string) {
      let bindings: SqlValue[] = [];
      const prepared = {
        bind(...values: SqlValue[]) {
          bindings = values;
          return prepared;
        },
        async first<T>() {
          return (
            (database.prepare(sql).get(...bindings) as T | undefined) ?? null
          );
        },
        async all<T>() {
          return {
            success: true,
            results: database.prepare(sql).all(...bindings) as T[],
            meta: { changes: 0 },
          };
        },
        async run() {
          const executed = database.prepare(sql).run(...bindings);
          return {
            success: true,
            results: [],
            meta: { changes: Number(executed.changes) },
          };
        },
      };
      return prepared;
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      batchCalls += 1;
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) {
          if (
            !failureInjected &&
            batchFailure?.call === batchCalls &&
            results.length === batchFailure.afterStatements
          ) {
            failureInjected = true;
            throw new Error('Injected D1 batch failure.');
          }
          results.push(await statement.run());
        }
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return result as unknown as D1Database;
}

function after(isoTimestamp: string, milliseconds = 60_000): number {
  return Date.parse(isoTimestamp) + milliseconds;
}

function payload(
  runId: string,
  options: {
    observedAt?: string;
    price?: number | null;
    availability?: 'in_stock' | 'preorder' | 'sold_out' | 'unknown';
    retailerName?: string;
  } = {},
): SaveScoutFindingsInput {
  const observedAt = options.observedAt ?? '2026-09-05T20:02:00Z';
  const price = options.price === undefined ? 49.95 : options.price;
  return {
    run: {
      id: runId,
      startedAt: observedAt,
      finishedAt: observedAt,
      sourceChecks: [
        {
          sourceIdentifier: 'reddit:r/PokemonTCGNL',
          status: 'checked',
          checkedAt: observedAt,
          coverageThrough: observedAt,
          errorCode: null,
          detail: null,
        },
      ],
    },
    findings: [
      {
        sourceKind: 'reddit_comment',
        sourceIdentifier: 'reddit:r/PokemonTCGNL',
        game: 'pokemon',
        headline: null,
        productName: 'Test-only sealed product',
        productLanguage: null,
        updateType: 'restock',
        summary: 'TEST RECORD: community restock report for persistence tests.',
        sourceUrl:
          'https://www.reddit.com/r/PokemonTCGNL/comments/test/comment/test',
        subreddit: 'PokemonTCGNL',
        sourcePostOrCommentId: 'comment:test-record',
        retailerName: options.retailerName ?? 'Test Seller Alpha',
        retailerOrOfficialUrl: null,
        publishedAt: null,
        observedAt,
        eventAt: null,
        actionOpensAt: null,
        actionDeadlineAt: null,
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'unknown',
        price,
        currency: price === null ? null : 'EUR',
        region: null,
        shippingToNetherlands: 'unknown',
        availability: options.availability ?? 'unknown',
        verificationStatus: 'community_report',
        verificationEvidence: null,
        collectionMethod: 'chatgpt_web_research',
      },
    ],
  };
}

function verifiedOfficialPayload(
  runId: string,
  observedAt: string,
): SaveScoutFindingsInput {
  const input = payload(runId, { observedAt, price: null });
  const sourceIdentifier = 'official:example-tcg-registration';
  const sourceUrl = 'https://example.com/tcg/registration';
  input.run.sourceChecks = [
    {
      sourceIdentifier,
      status: 'checked',
      checkedAt: observedAt,
      coverageThrough: observedAt,
      errorCode: null,
      detail: null,
    },
  ];
  input.findings = [
    {
      ...input.findings[0],
      sourceKind: 'official',
      sourceIdentifier,
      headline: 'Official registration is open',
      sourceUrl,
      subreddit: null,
      sourcePostOrCommentId: null,
      retailerName: null,
      retailerOrOfficialUrl: sourceUrl,
      verificationStatus: 'official_checked',
      verificationEvidence: {
        url: sourceUrl,
        observedAt,
        note: 'The official registration page remains open.',
      },
    },
  ];
  return input;
}

function count(database: DatabaseSync, table: string): number {
  return Number(
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ??
      0,
  );
}

void test('imports are retry-safe, update material facts, and preserve seller identity', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const firstInput = payload('run:first');
    const first = await saveScoutFindings(
      db,
      userA,
      firstInput,
      after(firstInput.run.finishedAt),
    );
    assert.deepEqual(
      {
        status: first.status,
        inserted: first.inserted,
        updated: first.updated,
        unchanged: first.unchanged,
      },
      { status: 'completed', inserted: 1, updated: 0, unchanged: 0 },
    );
    const replay = await saveScoutFindings(
      db,
      userA,
      firstInput,
      after(firstInput.run.finishedAt, 120_000),
    );
    assert.equal(replay.replayed, true);
    assert.equal(count(sqlite, 'scout_findings'), 1);
    let freshness = sqlite
      .prepare(
        'SELECT material_changed_at, last_observed_at FROM scout_findings WHERE user_id = ?',
      )
      .get(userA.id);
    assert.equal(
      freshness?.material_changed_at,
      Date.parse(firstInput.findings[0].observedAt),
    );
    assert.equal(
      freshness?.last_observed_at,
      Date.parse(firstInput.findings[0].observedAt),
    );

    const unchangedInput = payload('run:unchanged', {
      observedAt: '2026-09-05T21:00:00Z',
    });
    const unchanged = await saveScoutFindings(
      db,
      userA,
      unchangedInput,
      after(unchangedInput.run.finishedAt),
    );
    assert.equal(unchanged.unchanged, 1);
    assert.equal(count(sqlite, 'scout_finding_observations'), 1);
    freshness = sqlite
      .prepare(
        'SELECT material_changed_at, last_observed_at FROM scout_findings WHERE user_id = ?',
      )
      .get(userA.id);
    assert.equal(
      freshness?.material_changed_at,
      Date.parse(firstInput.findings[0].observedAt),
    );
    assert.equal(
      freshness?.last_observed_at,
      Date.parse(unchangedInput.findings[0].observedAt),
    );

    const updatedInput = payload('run:updated', {
      observedAt: '2026-09-05T22:00:00Z',
      price: 39.95,
      availability: 'in_stock',
    });
    const updated = await saveScoutFindings(
      db,
      userA,
      updatedInput,
      after(updatedInput.run.finishedAt),
    );
    assert.equal(updated.updated, 1);
    assert.equal(count(sqlite, 'scout_findings'), 1);
    assert.equal(count(sqlite, 'scout_finding_observations'), 2);
    const current = sqlite
      .prepare(
        'SELECT price_cents, availability FROM scout_findings WHERE user_id = ?',
      )
      .get(userA.id);
    assert.equal(current?.price_cents, 3_995);
    assert.equal(current?.availability, 'in_stock');
    freshness = sqlite
      .prepare(
        'SELECT material_changed_at, last_observed_at FROM scout_findings WHERE user_id = ?',
      )
      .get(userA.id);
    assert.equal(
      freshness?.material_changed_at,
      Date.parse(updatedInput.findings[0].observedAt),
    );
    assert.equal(
      freshness?.last_observed_at,
      Date.parse(updatedInput.findings[0].observedAt),
    );

    const seller = payload('run:other-seller', {
      observedAt: '2026-09-05T23:00:00Z',
      retailerName: 'Test Seller Beta',
    });
    const distinct = await saveScoutFindings(
      db,
      userA,
      seller,
      after(seller.run.finishedAt),
    );
    assert.equal(distinct.inserted, 1);
    assert.equal(count(sqlite, 'scout_findings'), 2);
  } finally {
    sqlite.close();
  }
});

void test('all reads and uniqueness constraints are isolated to the authenticated account', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const shared = payload('run:shared');
    shared.findings[0] = {
      ...shared.findings[0],
      eventAt: '2026-10-01',
    };
    await saveScoutFindings(db, userA, shared, after(shared.run.finishedAt));
    await saveScoutFindings(
      db,
      userB,
      shared,
      after(shared.run.finishedAt, 120_000),
    );
    assert.equal(count(sqlite, 'scout_findings'), 2);

    const stateA = await getScoutIngestionState(db, userA);
    const stateB = await getScoutIngestionState(db, userB);
    assert.equal(stateA.recentRuns.length, 1);
    assert.equal(stateB.recentRuns.length, 1);
    assert.equal(stateA.recentFindings.length, 1);
    assert.equal(stateB.recentFindings.length, 1);
    assert.notEqual(stateA.recentFindings[0].id, stateB.recentFindings[0].id);

    const dashboardA = await listScoutResearchDashboard(
      db,
      userA,
      Date.parse('2026-09-06T12:00:00Z'),
    );
    const dashboardB = await listScoutResearchDashboard(
      db,
      userB,
      Date.parse('2026-09-06T12:00:00Z'),
    );
    assert.equal(dashboardA.roadmapFindings.length, 1);
    assert.equal(dashboardB.roadmapFindings.length, 1);
    assert.notEqual(
      dashboardA.roadmapFindings[0].id,
      dashboardB.roadmapFindings[0].id,
    );

    const usersBeforeRead = count(sqlite, 'users');
    const newUserState = await getScoutIngestionState(db, {
      id: 'read-only-user',
      email: 'read-only@example.test',
      displayName: 'Read Only',
    });
    assert.equal(newUserState.recentRuns.length, 0);
    assert.equal(count(sqlite, 'users'), usersBeforeRead);
  } finally {
    sqlite.close();
  }
});

void test('verified rechecks refresh evidence without resetting material freshness', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  const firstObservedAt = '2026-09-05T20:02:00Z';
  const recheckedAt = '2026-09-05T21:02:00Z';
  try {
    const first = verifiedOfficialPayload(
      'run:verified-first',
      firstObservedAt,
    );
    const inserted = await saveScoutFindings(
      db,
      userA,
      first,
      after(first.run.finishedAt),
    );
    assert.equal(inserted.inserted, 1);

    const recheck = verifiedOfficialPayload(
      'run:verified-recheck',
      recheckedAt,
    );
    recheck.findings[0] = {
      ...recheck.findings[0],
      headline: 'Official registration remains open',
      summary: 'TEST RECORD: the same official fact, phrased differently.',
      verificationEvidence: {
        ...recheck.findings[0].verificationEvidence!,
        note: 'The same official page was checked again this hour.',
      },
    };
    const unchanged = await saveScoutFindings(
      db,
      userA,
      recheck,
      after(recheck.run.finishedAt),
    );
    assert.equal(unchanged.unchanged, 1);
    assert.equal(unchanged.updated, 0);
    assert.equal(count(sqlite, 'scout_finding_observations'), 1);

    const stored = sqlite
      .prepare(
        `SELECT material_changed_at, last_observed_at, verification_observed_at,
                verification_evidence_json
         FROM scout_findings WHERE user_id = ?`,
      )
      .get(userA.id);
    assert.equal(stored?.material_changed_at, Date.parse(firstObservedAt));
    assert.equal(stored?.last_observed_at, Date.parse(recheckedAt));
    assert.equal(stored?.verification_observed_at, Date.parse(recheckedAt));
    assert.equal(
      JSON.parse(String(stored?.verification_evidence_json)).observedAt,
      recheckedAt,
    );
    const dashboard = await listScoutResearchDashboard(db, userA);
    assert.equal(
      dashboard.findings[0].headline,
      'Official registration remains open',
    );
    assert.equal(
      dashboard.findings[0].summary,
      'TEST RECORD: the same official fact, phrased differently.',
    );
  } finally {
    sqlite.close();
  }
});

void test('older future milestones survive the recent-finding display limit', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const milestone = payload('run:future-milestone', {
      observedAt: '2026-09-05T20:02:00Z',
      price: null,
    });
    milestone.findings[0] = {
      ...milestone.findings[0],
      headline: 'TEST RECORD: future release milestone',
      eventAt: '2026-09-06T22:45:00Z',
    };
    await saveScoutFindings(
      db,
      userA,
      milestone,
      after(milestone.run.finishedAt),
    );

    for (let batch = 0; batch < 6; batch += 1) {
      const observedAt = new Date(
        Date.parse('2026-09-05T20:10:00Z') + batch * 60_000,
      ).toISOString();
      const recent = payload(`run:recent-${batch}`, {
        observedAt,
        price: null,
      });
      const template = recent.findings[0];
      recent.findings = Array.from({ length: 20 }, (_, index) => ({
        ...template,
        headline: `TEST RECORD: recent finding ${batch}-${index}`,
        productName: `TEST RECORD: product ${batch}-${index}`,
        eventAt: '2026-09-06T10:00:00Z',
        sourcePostOrCommentId: `comment:recent-${batch}-${index}`,
        sourceUrl: `https://www.reddit.com/r/PokemonTCGNL/comments/test/comment/recent-${batch}-${index}`,
      }));
      await saveScoutFindings(db, userA, recent, after(recent.run.finishedAt));
    }

    const dashboard = await listScoutResearchDashboard(
      db,
      userA,
      Date.parse('2026-09-06T22:30:00Z'),
    );
    const persistedMilestone = dashboard.findings.find(
      (finding) => finding.headline === 'TEST RECORD: future release milestone',
    );
    assert.equal(persistedMilestone?.eventAt, '2026-09-06T22:45:00Z');
    assert.ok(dashboard.findings.length > 50);
  } finally {
    sqlite.close();
  }
});

void test('July roadmap history survives newer undated dashboard findings', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const julyMilestone = payload('run:july-roadmap-history', {
      observedAt: '2026-07-02T08:00:00Z',
      price: null,
    });
    julyMilestone.findings[0] = {
      ...julyMilestone.findings[0],
      headline: 'TEST RECORD: July roadmap milestone',
      eventAt: '2026-07-15',
      sourcePostOrCommentId: 'comment:july-roadmap-history',
      sourceUrl:
        'https://www.reddit.com/r/PokemonTCGNL/comments/test/comment/july-roadmap-history',
    };
    await saveScoutFindings(
      db,
      userA,
      julyMilestone,
      after(julyMilestone.run.finishedAt),
    );

    for (let batch = 0; batch < 3; batch += 1) {
      const observedAt = new Date(
        Date.parse('2026-09-05T20:10:00Z') + batch * 60_000,
      ).toISOString();
      const recent = payload(`run:undated-recent-${batch}`, {
        observedAt,
        price: null,
      });
      const template = recent.findings[0];
      recent.findings = Array.from({ length: 20 }, (_, index) => ({
        ...template,
        headline: `TEST RECORD: undated recent finding ${batch}-${index}`,
        productName: `TEST RECORD: undated product ${batch}-${index}`,
        sourcePostOrCommentId: `comment:undated-${batch}-${index}`,
        sourceUrl: `https://www.reddit.com/r/PokemonTCGNL/comments/test/comment/undated-${batch}-${index}`,
      }));
      await saveScoutFindings(db, userA, recent, after(recent.run.finishedAt));
    }

    const dashboard = await listScoutResearchDashboard(
      db,
      userA,
      Date.parse('2026-09-06T12:00:00Z'),
    );
    assert.equal(
      dashboard.findings.some(
        (finding) => finding.headline === 'TEST RECORD: July roadmap milestone',
      ),
      false,
    );
    assert.equal(
      dashboard.roadmapFindings.find(
        (finding) => finding.headline === 'TEST RECORD: July roadmap milestone',
      )?.eventAt,
      '2026-07-15',
    );
    assert.equal(dashboard.roadmapCoverageLimited, false);
  } finally {
    sqlite.close();
  }
});

void test('January roadmap query includes the prior July Amsterdam boundary', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const boundary = payload('run:amsterdam-july-boundary', {
      observedAt: '2026-07-02T08:00:00Z',
      price: null,
    });
    boundary.findings[0] = {
      ...boundary.findings[0],
      headline: 'TEST RECORD: Amsterdam July boundary',
      eventAt: '2026-06-30T22:30:00Z',
      sourcePostOrCommentId: 'comment:amsterdam-july-boundary',
      sourceUrl:
        'https://www.reddit.com/r/PokemonTCGNL/comments/test/comment/amsterdam-july-boundary',
    };
    await saveScoutFindings(
      db,
      userA,
      boundary,
      after(boundary.run.finishedAt),
    );

    const dashboard = await listScoutResearchDashboard(
      db,
      userA,
      Date.parse('2027-01-12T12:00:00Z'),
    );
    assert.equal(dashboard.roadmapFindings.length, 1);
    assert.equal(
      dashboard.roadmapFindings[0].headline,
      'TEST RECORD: Amsterdam July boundary',
    );
    assert.equal(dashboard.roadmapFindings[0].eventAt, '2026-06-30T22:30:00Z');
  } finally {
    sqlite.close();
  }
});

void test('unknown values remain null in Community Radar', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const unknown = payload('run:unknown', { price: null });
    unknown.findings[0] = {
      ...unknown.findings[0],
      headline: 'Registration window confirmed',
      eventAt: '2026-10-03T09:00:00+02:00',
      actionOpensAt: '2026-09-10T09:00:00+02:00',
      actionDeadlineAt: '2026-09-20T18:00:00+02:00',
      actionType: 'register',
      actionInstruction: 'Register on the organizer page before the deadline.',
      actionUrl: 'https://example.com/register',
      lifecycleStatus: 'registration_open',
    };
    await saveScoutFindings(db, userA, unknown, after(unknown.run.finishedAt));
    const dashboard = await listScoutResearchDashboard(db, userA);
    assert.equal(dashboard.findings[0].price, null);
    assert.equal(dashboard.findings[0].currency, null);
    assert.equal(dashboard.findings[0].productLanguage, null);
    assert.equal(dashboard.findings[0].region, null);
    assert.equal(dashboard.findings[0].shippingToNetherlands, 'unknown');
    assert.equal(dashboard.findings[0].availability, 'unknown');
    assert.equal(
      dashboard.findings[0].headline,
      'Registration window confirmed',
    );
    assert.equal(dashboard.findings[0].actionType, 'register');
    assert.equal(
      dashboard.findings[0].actionDeadlineAt,
      '2026-09-20T18:00:00+02:00',
    );
    assert.equal(dashboard.findings[0].lifecycleStatus, 'registration_open');
    assert.equal(
      dashboard.findings[0].materialChangedAt,
      new Date(unknown.findings[0].observedAt).toISOString(),
    );
    assert.equal(dashboard.importStatus.latestRun?.inserted, 1);
  } finally {
    sqlite.close();
  }
});

void test('empty completed runs advance coverage while partial and failed runs do not', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  const emptyRun = (
    id: string,
    at: string,
    sourceChecks: SaveScoutFindingsInput['run']['sourceChecks'],
  ): SaveScoutFindingsInput => ({
    run: { id, startedAt: at, finishedAt: at, sourceChecks },
    findings: [],
  });
  try {
    const completedAt = '2026-09-05T20:00:00Z';
    const checked = {
      sourceIdentifier: 'reddit:r/PokemonTCGNL',
      status: 'checked' as const,
      checkedAt: completedAt,
      coverageThrough: completedAt,
      errorCode: null,
      detail: null,
    };
    const completed = await saveScoutFindings(
      db,
      userA,
      emptyRun('run:empty-completed', completedAt, [checked]),
      after(completedAt),
    );
    assert.equal(completed.status, 'completed');
    assert.equal(completed.inserted, 0);

    const partialAt = '2026-09-05T21:00:00Z';
    const partial = await saveScoutFindings(
      db,
      userA,
      emptyRun('run:partial', partialAt, [
        { ...checked, checkedAt: partialAt, coverageThrough: partialAt },
        {
          sourceIdentifier: 'reddit:r/riftboundtcg',
          status: 'inaccessible',
          checkedAt: partialAt,
          coverageThrough: null,
          errorCode: 'access_denied',
          detail: 'The current megathread could not be opened.',
        },
      ]),
      after(partialAt),
    );
    assert.equal(partial.status, 'partial');
    let state = await getScoutIngestionState(db, userA);
    assert.equal(
      state.lastSuccessfulImportAt,
      new Date(completedAt).toISOString(),
    );
    assert.equal(state.lastRunStatus, 'partial');
    assert.match(state.actionableError ?? '', /could not be opened/i);

    const failedAt = '2026-09-05T22:00:00Z';
    const failed = await saveScoutFindings(
      db,
      userA,
      emptyRun('run:failed', failedAt, [
        {
          sourceIdentifier: 'reddit:r/PKMNTCGDeals',
          status: 'failed',
          checkedAt: failedAt,
          coverageThrough: null,
          errorCode: 'source_error',
          detail: 'Source lookup failed.',
        },
      ]),
      after(failedAt),
    );
    assert.equal(failed.status, 'failed');
    state = await getScoutIngestionState(db, userA);
    assert.equal(
      state.lastSuccessfulImportAt,
      new Date(completedAt).toISOString(),
    );
    assert.equal(state.lastRunStatus, 'failed');
  } finally {
    sqlite.close();
  }
});

void test('failed final batches roll back atomically and retry with the same run ID', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite, { call: 1, afterStatements: 2 });
  const retryInput = payload('run:retry-after-persistence-failure');
  const firstAttemptAt = after(retryInput.run.finishedAt);
  try {
    await assert.rejects(
      saveScoutFindings(db, userA, retryInput, firstAttemptAt),
      /Injected D1 batch failure/,
    );
    assert.equal(count(sqlite, 'scout_ingestion_runs'), 1);
    assert.equal(count(sqlite, 'scout_ingestion_source_checks'), 0);
    assert.equal(count(sqlite, 'scout_findings'), 0);
    assert.equal(count(sqlite, 'scout_finding_observations'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
    const failedRun = sqlite
      .prepare(
        `SELECT status, result_json
         FROM scout_ingestion_runs
         WHERE user_id = ? AND external_run_id = ?`,
      )
      .get(userA.id, retryInput.run.id);
    assert.equal(failedRun?.status, 'failed');
    assert.match(String(failedRun?.result_json), /persistence_failed/);

    const retried = await saveScoutFindings(
      db,
      userA,
      retryInput,
      firstAttemptAt + 1_000,
    );
    assert.equal(retried.status, 'completed');
    assert.equal(retried.replayed, false);
    assert.equal(retried.inserted, 1);
    assert.equal(retried.rejected, 0);
    assert.equal(count(sqlite, 'scout_ingestion_runs'), 1);
    assert.equal(count(sqlite, 'scout_ingestion_source_checks'), 1);
    assert.equal(count(sqlite, 'scout_findings'), 1);
    assert.equal(count(sqlite, 'scout_finding_observations'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);

    const replayed = await saveScoutFindings(
      db,
      userA,
      retryInput,
      firstAttemptAt + 2_000,
    );
    assert.equal(replayed.replayed, true);
    assert.equal(count(sqlite, 'scout_findings'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 1);
  } finally {
    sqlite.close();
  }
});

void test('stale empty-result run leases are reclaimed without reopening recent work', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  const staleInput = payload('run:stale-processing-lease');
  const initialAttemptAt = after(staleInput.run.finishedAt);
  try {
    await saveScoutFindings(db, userA, staleInput, initialAttemptAt);
    sqlite
      .prepare(
        `UPDATE scout_ingestion_runs
         SET result_json = '{}', updated_at = ?
         WHERE user_id = ? AND external_run_id = ?`,
      )
      .run(initialAttemptAt, userA.id, staleInput.run.id);

    await assert.rejects(
      saveScoutFindings(db, userA, staleInput, initialAttemptAt + 60_000),
      /still being processed/,
    );

    sqlite
      .prepare(
        `UPDATE scout_ingestion_runs SET updated_at = ?
         WHERE user_id = ? AND external_run_id = ?`,
      )
      .run(initialAttemptAt - 5 * 60_000 - 1, userA.id, staleInput.run.id);
    const reclaimed = await saveScoutFindings(
      db,
      userA,
      staleInput,
      initialAttemptAt + 60_000,
    );
    assert.equal(reclaimed.replayed, false);
    assert.equal(reclaimed.status, 'completed');
    assert.equal(reclaimed.unchanged, 1);
    assert.equal(count(sqlite, 'scout_ingestion_runs'), 1);
    assert.equal(count(sqlite, 'scout_findings'), 1);
    assert.equal(count(sqlite, 'scout_finding_observations'), 1);

    const replayed = await saveScoutFindings(
      db,
      userA,
      staleInput,
      initialAttemptAt + 120_000,
    );
    assert.equal(replayed.replayed, true);
  } finally {
    sqlite.close();
  }
});

void test('late older observations are retained without overwriting current facts', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  const newer = payload('run:newer-facts', {
    observedAt: '2026-09-05T22:00:00Z',
    price: 39.95,
    availability: 'in_stock',
  });
  const older = payload('run:late-older-facts', {
    observedAt: '2026-09-05T21:00:00Z',
    price: 89.95,
    availability: 'sold_out',
  });
  try {
    await saveScoutFindings(db, userA, newer, after(newer.run.finishedAt));
    const before = sqlite
      .prepare(
        `SELECT price_cents, availability, material_hash, latest_run_id,
                last_observed_at
         FROM scout_findings WHERE user_id = ?`,
      )
      .get(userA.id);

    const staleResult = await saveScoutFindings(
      db,
      userA,
      older,
      after(newer.run.finishedAt, 120_000),
    );
    assert.equal(staleResult.updated, 0);
    assert.equal(staleResult.unchanged, 1);
    const afterStale = sqlite
      .prepare(
        `SELECT price_cents, availability, material_hash, latest_run_id,
                last_observed_at
         FROM scout_findings WHERE user_id = ?`,
      )
      .get(userA.id);
    assert.deepEqual(afterStale, before);
    assert.equal(count(sqlite, 'scout_finding_observations'), 2);
  } finally {
    sqlite.close();
  }
});

void test('source check diagnostic text is sanitized before persistence and reads', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  const sanitizedInput = payload('run:sanitized-source-check');
  sanitizedInput.run.sourceChecks[0].errorCode =
    '\u0000 upstream_error \n admin@example.test ';
  sanitizedInput.run.sourceChecks[0].detail =
    ' Contact admin@example.test\n or +31 6 1234 5678 for access. ';
  try {
    await saveScoutFindings(
      db,
      userA,
      sanitizedInput,
      after(sanitizedInput.run.finishedAt),
    );
    const state = await getScoutIngestionState(db, userA);
    const sourceCheck = state.recentRuns[0]?.sourceChecks[0];
    assert.equal(sourceCheck?.errorCode, 'upstream_error [redacted email]');
    assert.doesNotMatch(sourceCheck?.detail ?? '', /admin@example\.test/);
    assert.doesNotMatch(sourceCheck?.detail ?? '', /1234 5678/);
    assert.match(sourceCheck?.detail ?? '', /\[redacted email\]/);
    assert.match(sourceCheck?.detail ?? '', /\[redacted phone\]/);
    assert.doesNotMatch(sourceCheck?.detail ?? '', /[\r\n]/);
  } finally {
    sqlite.close();
  }
});
