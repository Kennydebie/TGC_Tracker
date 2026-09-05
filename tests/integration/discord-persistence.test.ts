import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { normaliseCommunitySignal } from '../../lib/community.ts';
import { persistCommunityScan } from '../../lib/repositories/community.ts';

type SqlValue = string | number | null;

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

async function signal(
  id: string,
  text = 'Pokémon mystery booster restock €109 at Amazon DE',
) {
  const result = await normaliseCommunitySignal(
    {
      platform: 'discord',
      community: '800000000000000001',
      channel: '700000000000000001',
      externalId: id,
      authorExternalId: id,
      text,
      occurredAt: '2026-09-05T13:01:00Z',
    },
    { authorSalt: 'test-only-salt' },
  );
  assert.ok(result);
  return result;
}
async function save(
  db: D1Database,
  record: Awaited<ReturnType<typeof signal>>,
) {
  return persistCommunityScan(db, {
    id: crypto.randomUUID(),
    platform: 'discord',
    status: 'connected',
    startedAt: Date.now(),
    finishedAt: Date.now(),
    eventsReceived: 1,
    messagesFiltered: 0,
    signalsCreated: 1,
    duplicatesClustered: 0,
    productsMatched: 0,
    rateLimitRemaining: null,
    errorCode: null,
    errorDetail: null,
    signals: [record],
  });
}
void test('Discord unresolved products persist with foreign keys and no permanent raw review copy', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  try {
    const record = await signal('900000000000000001');
    assert.equal(record.unresolved, true);
    const result = await save(asD1(sqlite), record);
    assert.equal(result.signalsCreated, 1);
    const review = sqlite
      .prepare('SELECT source_id, payload_json FROM review_queue')
      .get();
    assert.equal(review?.source_id, null);
    assert.ok(String(review?.payload_json).includes('communitySourceId'));
    assert.equal(String(review?.payload_json).includes('excerpt'), false);
  } finally {
    sqlite.close();
  }
});
void test('sequential messages accumulate mentions while retries create zero new signals', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  try {
    const db = asD1(sqlite),
      first = await signal('900000000000000001');
    await save(db, first);
    const second = await signal('900000000000000002');
    await save(db, second);
    assert.equal((await save(db, first)).signalsCreated, 0);
    const event = sqlite
      .prepare(
        'SELECT mention_count, unique_author_count FROM community_signal_events',
      )
      .get();
    assert.equal(event?.mention_count, 2);
    assert.equal(event?.unique_author_count, 2);
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM community_signals').get()?.n,
      2,
    );
  } finally {
    sqlite.close();
  }
});
