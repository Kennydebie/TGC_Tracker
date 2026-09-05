import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  authenticateScoutIntegration,
  createScoutIntegrationCredential,
  listScoutIntegrationCredentials,
  revokeScoutIntegrationCredential,
} from '../../lib/repositories/scout-integration.ts';
import {
  constantTimeEqualHex,
  generateScoutIntegrationToken,
  hashScoutIntegrationToken,
  readBoundedJson,
  SCOUT_INTEGRATION_SUBJECT_HEADER,
  ScoutIntegrationAuthenticationError,
  ScoutIntegrationRequestError,
} from '../../lib/scout-integration.ts';
import type { RequestUser } from '../../lib/server/user.ts';

type SqlValue = string | number | null;

const userA: RequestUser = {
  id: 'integration-owner-a',
  email: 'owner-a@example.test',
  displayName: 'Owner A',
};
const userB: RequestUser = {
  id: 'integration-owner-b',
  email: 'owner-b@example.test',
  displayName: 'Owner B',
};
const subjectA = 'github:123456789';
const subjectB = 'github:987654321';
const createdAt = Date.parse('2026-09-06T10:00:00.000Z');

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

function integrationRequest(
  token: string,
  subject: string | null,
  injectedUser?: RequestUser,
) {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (subject) headers.set(SCOUT_INTEGRATION_SUBJECT_HEADER, subject);
  if (injectedUser) {
    headers.set('oai-authenticated-user-id', injectedUser.id);
    headers.set('oai-authenticated-user-email', injectedUser.email);
  }
  return new Request(
    'https://scout.example.test/api/integrations/scout-mcp/state',
    {
      headers,
    },
  );
}

async function expectAuthenticationError(
  operation: Promise<unknown>,
  code: ScoutIntegrationAuthenticationError['code'],
) {
  const error = await captureAuthenticationError(operation);
  assert.equal(error.code, code);
}

async function captureAuthenticationError(
  operation: Promise<unknown>,
): Promise<ScoutIntegrationAuthenticationError> {
  try {
    await operation;
    assert.fail('Expected integration authentication to fail.');
  } catch (error) {
    assert.ok(error instanceof ScoutIntegrationAuthenticationError);
    return error;
  }
}

async function expectRequestError(
  request: Request,
  maximumBytes: number,
  code: ScoutIntegrationRequestError['code'],
  status: ScoutIntegrationRequestError['status'],
) {
  await assert.rejects(readBoundedJson(request, maximumBytes), (error) => {
    assert.ok(error instanceof ScoutIntegrationRequestError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

void test('owner creation hashes a generated token, isolates metadata, and revokes only the owner credential', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const createdA = await createScoutIntegrationCredential(
      db,
      userA,
      {
        label: 'Hourly research bridge',
        oauthSubject: subjectA,
        scopes: ['scout:write', 'scout:read'],
      },
      createdAt,
    );
    const createdB = await createScoutIntegrationCredential(
      db,
      userB,
      {
        label: 'Other owner bridge',
        oauthSubject: subjectB,
        scopes: ['scout:read'],
      },
      createdAt + 1,
    );

    assert.match(
      createdA.token,
      /^tcs_int_[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/,
    );
    assert.equal(
      createdA.credential.tokenId,
      createdA.token.slice('tcs_int_'.length).split('.')[0],
    );
    assert.deepEqual(createdA.credential.scopes, ['scout:read', 'scout:write']);
    assert.notEqual(createdA.token, createdB.token);

    const stored = sqlite
      .prepare(
        `SELECT user_id, token_id, token_hash, scopes_json
         FROM scout_integration_credentials WHERE id = ?`,
      )
      .get(createdA.credential.id);
    const expectedHash = await hashScoutIntegrationToken(createdA.token);
    assert.equal(stored?.user_id, userA.id);
    assert.equal(stored?.token_id, createdA.credential.tokenId);
    assert.equal(stored?.token_hash, expectedHash);
    assert.equal(stored?.scopes_json, '["scout:read","scout:write"]');
    assert.equal(
      constantTimeEqualHex(String(stored?.token_hash), expectedHash),
      true,
    );
    assert.equal(constantTimeEqualHex(expectedHash, '0'.repeat(64)), false);

    const auditJson = sqlite
      .prepare(
        `SELECT metadata_json FROM audit_logs
         WHERE target_id = ? AND action = 'scout_integration_created'`,
      )
      .get(createdA.credential.id)?.metadata_json;
    assert.equal(String(auditJson).includes(createdA.token), false);
    assert.equal(String(auditJson).includes(expectedHash), false);

    const listA = await listScoutIntegrationCredentials(db, userA);
    const listB = await listScoutIntegrationCredentials(db, userB);
    assert.deepEqual(
      listA.map((credential) => credential.id),
      [createdA.credential.id],
    );
    assert.deepEqual(
      listB.map((credential) => credential.id),
      [createdB.credential.id],
    );
    assert.equal('token' in listA[0], false);
    assert.equal('tokenHash' in listA[0], false);

    assert.equal(
      await revokeScoutIntegrationCredential(
        db,
        userB,
        createdA.credential.id,
        createdAt + 2,
      ),
      false,
    );
    assert.equal(
      await revokeScoutIntegrationCredential(
        db,
        userA,
        createdA.credential.id,
        createdAt + 3,
      ),
      true,
    );
    assert.equal(
      await revokeScoutIntegrationCredential(
        db,
        userA,
        createdA.credential.id,
        createdAt + 4,
      ),
      false,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_logs
           WHERE target_id = ? AND action = 'scout_integration_revoked'`,
        )
        .get(createdA.credential.id)?.count,
      1,
    );
    assert.equal(
      (await listScoutIntegrationCredentials(db, userA))[0].status,
      'revoked',
    );
  } finally {
    sqlite.close();
  }
});

void test('authentication binds the stored user and OAuth subject and enforces read/write scopes', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const readCredential = await createScoutIntegrationCredential(
      db,
      userA,
      {
        oauthSubject: subjectA,
        scopes: ['scout:read'],
      },
      createdAt,
    );
    const writeCredential = await createScoutIntegrationCredential(
      db,
      userA,
      {
        oauthSubject: subjectA,
        scopes: ['scout:write'],
      },
      createdAt + 1,
    );

    const authenticated = await authenticateScoutIntegration(
      db,
      integrationRequest(readCredential.token, subjectA, userB),
      'scout:read',
      createdAt + 10,
    );
    assert.deepEqual(authenticated.user, userA);
    assert.equal(authenticated.credentialId, readCredential.credential.id);
    assert.equal(
      sqlite
        .prepare(
          'SELECT last_used_at FROM scout_integration_credentials WHERE id = ?',
        )
        .get(readCredential.credential.id)?.last_used_at,
      createdAt + 10,
    );

    await expectAuthenticationError(
      authenticateScoutIntegration(
        db,
        integrationRequest(readCredential.token, null),
        'scout:read',
        createdAt + 11,
      ),
      'invalid_credential',
    );
    await expectAuthenticationError(
      authenticateScoutIntegration(
        db,
        integrationRequest(readCredential.token, subjectB),
        'scout:read',
        createdAt + 11,
      ),
      'invalid_credential',
    );
    await expectAuthenticationError(
      authenticateScoutIntegration(
        db,
        integrationRequest(readCredential.token, subjectA),
        'scout:write',
        createdAt + 11,
      ),
      'insufficient_scope',
    );
    await expectAuthenticationError(
      authenticateScoutIntegration(
        db,
        integrationRequest(writeCredential.token, subjectA),
        'scout:read',
        createdAt + 11,
      ),
      'insufficient_scope',
    );
    const writeAuthentication = await authenticateScoutIntegration(
      db,
      integrationRequest(writeCredential.token, subjectA),
      'scout:write',
      createdAt + 12,
    );
    assert.equal(writeAuthentication.user.id, userA.id);
  } finally {
    sqlite.close();
  }
});

void test('missing, malformed, wrong, expired, and revoked credentials expose one invalid-credential result', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const db = asD1(sqlite);
  try {
    const active = await createScoutIntegrationCredential(
      db,
      userA,
      { oauthSubject: subjectA, scopes: ['scout:read'] },
      createdAt,
    );
    const expired = await createScoutIntegrationCredential(
      db,
      userA,
      {
        oauthSubject: subjectA,
        scopes: ['scout:read'],
        expiresAt: new Date(createdAt + 100).toISOString(),
      },
      createdAt,
    );
    const revoked = await createScoutIntegrationCredential(
      db,
      userA,
      { oauthSubject: subjectA, scopes: ['scout:read'] },
      createdAt,
    );
    await revokeScoutIntegrationCredential(
      db,
      userA,
      revoked.credential.id,
      createdAt + 1,
    );

    const replacementLastCharacter = active.token.endsWith('A') ? 'B' : 'A';
    const wrongSecret = `${active.token.slice(0, -1)}${replacementLastCharacter}`;
    const unknown = generateScoutIntegrationToken().token;
    const requestWithAuthorization = (authorization: string) =>
      new Request(
        'https://scout.example.test/api/integrations/scout-mcp/state',
        {
          headers: {
            authorization,
            [SCOUT_INTEGRATION_SUBJECT_HEADER]: subjectA,
          },
        },
      );
    const invalidAttempts = [
      () =>
        authenticateScoutIntegration(
          db,
          new Request(
            'https://scout.example.test/api/integrations/scout-mcp/state',
            { headers: { [SCOUT_INTEGRATION_SUBJECT_HEADER]: subjectA } },
          ),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          requestWithAuthorization('Basic not-a-bearer-token'),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          requestWithAuthorization('Bearer tcs_int_malformed'),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(active.token, null),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(active.token, subjectB),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(wrongSecret, subjectA),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(unknown, subjectA),
          'scout:read',
          createdAt + 2,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(expired.token, subjectA),
          'scout:read',
          createdAt + 100,
        ),
      () =>
        authenticateScoutIntegration(
          db,
          integrationRequest(revoked.token, subjectA),
          'scout:read',
          createdAt + 2,
        ),
    ];
    const errors: ScoutIntegrationAuthenticationError[] = [];
    for (const attempt of invalidAttempts)
      errors.push(await captureAuthenticationError(attempt()));
    assert.deepEqual(
      [...new Set(errors.map((error) => error.code))],
      ['invalid_credential'],
    );
    assert.deepEqual([...new Set(errors.map((error) => error.status))], [401]);
  } finally {
    sqlite.close();
  }
});

void test('bounded JSON rejects malformed, oversized, and unsupported-media bodies', async () => {
  const endpoint =
    'https://scout.example.test/api/integrations/scout-mcp/findings';
  await expectRequestError(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"incomplete":',
    }),
    1_024,
    'invalid_json',
    400,
  );
  await expectRequestError(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(64) }),
    }),
    16,
    'payload_too_large',
    413,
  );
  await expectRequestError(
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-length': '17',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
    16,
    'payload_too_large',
    413,
  );
  await expectRequestError(
    new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }),
    1_024,
    'unsupported_media_type',
    415,
  );
});
