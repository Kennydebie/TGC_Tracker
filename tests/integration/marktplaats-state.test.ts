import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireMarktplaatsLock,
  releaseMarktplaatsLock,
} from '../../lib/repositories/marktplaats.ts';

type Lock = { owner: string; expiresAt: number };

function fakeLockDatabase() {
  let lock: Lock | null = null;
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...input: unknown[]) {
          values = input;
          return statement;
        },
        async run() {
          if (
            sql.startsWith('DELETE FROM scan_locks WHERE id = ? AND expires_at')
          ) {
            if (lock && lock.expiresAt <= Number(values[1])) lock = null;
          } else if (
            sql.startsWith(
              'DELETE FROM scan_locks WHERE id = ? AND owner_job_id',
            )
          ) {
            if (lock?.owner === values[1]) lock = null;
          } else if (sql.includes('INSERT INTO scan_locks') && !lock) {
            lock = { owner: String(values[1]), expiresAt: Number(values[3]) };
          }
          return { success: true };
        },
        async first() {
          return lock ? { owner_job_id: lock.owner } : null;
        },
      };
      return statement;
    },
  };
  return database as unknown as D1Database;
}

void test('Marktplaats lock is exclusive, releasable and recoverable after expiry', async () => {
  const db = fakeLockDatabase();
  assert.equal(await acquireMarktplaatsLock(db, 'job-a', 1_000), true);
  assert.equal(await acquireMarktplaatsLock(db, 'job-b', 2_000), false);
  await releaseMarktplaatsLock(db, 'job-a');
  assert.equal(await acquireMarktplaatsLock(db, 'job-b', 3_000), true);
  assert.equal(
    await acquireMarktplaatsLock(db, 'job-c', 3_000 + 15 * 60_000),
    true,
  );
});
