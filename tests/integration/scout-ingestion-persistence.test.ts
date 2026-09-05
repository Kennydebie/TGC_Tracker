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

function asD1(database: DatabaseSync) {
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
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
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
    const first = await saveScoutFindings(db, userA, firstInput, 1_000);
    assert.deepEqual(
      {
        status: first.status,
        inserted: first.inserted,
        updated: first.updated,
        unchanged: first.unchanged,
      },
      { status: 'completed', inserted: 1, updated: 0, unchanged: 0 },
    );
    const replay = await saveScoutFindings(db, userA, firstInput, 2_000);
    assert.equal(replay.replayed, true);
    assert.equal(count(sqlite, 'scout_findings'), 1);

    const unchanged = await saveScoutFindings(
      db,
      userA,
      payload('run:unchanged', { observedAt: '2026-09-05T21:00:00Z' }),
      3_000,
    );
    assert.equal(unchanged.unchanged, 1);
    assert.equal(count(sqlite, 'scout_finding_observations'), 1);

    const updated = await saveScoutFindings(
      db,
      userA,
      payload('run:updated', {
        observedAt: '2026-09-05T22:00:00Z',
        price: 39.95,
        availability: 'in_stock',
      }),
      4_000,
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

    const seller = payload('run:other-seller', {
      observedAt: '2026-09-05T23:00:00Z',
      retailerName: 'Test Seller Beta',
    });
    const distinct = await saveScoutFindings(db, userA, seller, 5_000);
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
    await saveScoutFindings(db, userA, payload('run:shared'), 1_000);
    await saveScoutFindings(db, userB, payload('run:shared'), 2_000);
    assert.equal(count(sqlite, 'scout_findings'), 2);

    const stateA = await getScoutIngestionState(db, userA);
    const stateB = await getScoutIngestionState(db, userB);
    assert.equal(stateA.recentRuns.length, 1);
    assert.equal(stateB.recentRuns.length, 1);
    assert.equal(stateA.recentFindings.length, 1);
    assert.equal(stateB.recentFindings.length, 1);
    assert.notEqual(stateA.recentFindings[0].id, stateB.recentFindings[0].id);

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

void test('unknown values remain null in Community Radar', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    await saveScoutFindings(
      db,
      userA,
      payload('run:unknown', { price: null }),
      1_000,
    );
    const dashboard = await listScoutResearchDashboard(db, userA);
    assert.equal(dashboard.findings[0].price, null);
    assert.equal(dashboard.findings[0].currency, null);
    assert.equal(dashboard.findings[0].productLanguage, null);
    assert.equal(dashboard.findings[0].region, null);
    assert.equal(dashboard.findings[0].shippingToNetherlands, 'unknown');
    assert.equal(dashboard.findings[0].availability, 'unknown');
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
      1_000,
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
      2_000,
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
      3_000,
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
