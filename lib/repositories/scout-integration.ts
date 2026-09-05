import type { D1Database } from '@cloudflare/workers-types';

import type { RequestUser } from '../server/user.ts';
import {
  constantTimeEqualHex,
  createScoutIntegrationCredentialSchema,
  generateScoutIntegrationToken,
  hashScoutIntegrationToken,
  isScoutIntegrationOauthSubject,
  parseScoutIntegrationScopes,
  parseScoutIntegrationToken,
  SCOUT_INTEGRATION_SUBJECT_HEADER,
  ScoutIntegrationAuthenticationError,
  ScoutIntegrationCredentialError,
  type CreatedScoutIntegrationCredential,
  type CreateScoutIntegrationCredentialInput,
  type ScoutIntegrationCredentialMetadata,
  type ScoutIntegrationScope,
} from '../scout-integration.ts';
import { ensureUser } from './user-state.ts';

const MAX_ACTIVE_CREDENTIALS = 5;
const UNKNOWN_TOKEN_HASH = '1'.repeat(64);
const CREDENTIAL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CredentialRow = {
  id: string;
  user_id: string;
  user_email: string;
  user_display_name: string | null;
  label: string;
  token_id: string;
  token_hash: string;
  oauth_subject: string;
  scopes_json: string;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
  revoked_at: number | null;
};

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function metadata(
  row: Omit<CredentialRow, 'token_hash' | 'user_email' | 'user_display_name'>,
  now = Date.now(),
): ScoutIntegrationCredentialMetadata {
  return {
    id: row.id,
    label: row.label,
    tokenId: row.token_id,
    oauthSubject: row.oauth_subject,
    scopes: parseScoutIntegrationScopes(row.scopes_json),
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: iso(row.expires_at),
    lastUsedAt: iso(row.last_used_at),
    revokedAt: iso(row.revoked_at),
    status:
      row.revoked_at !== null
        ? 'revoked'
        : row.expires_at !== null && row.expires_at <= now
          ? 'expired'
          : 'active',
  };
}

export async function listScoutIntegrationCredentials(
  db: D1Database,
  user: RequestUser,
): Promise<ScoutIntegrationCredentialMetadata[]> {
  const rows = await db
    .prepare(
      `SELECT id, user_id, label, token_id, oauth_subject, scopes_json,
              created_at, expires_at, last_used_at, revoked_at
       FROM scout_integration_credentials
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .bind(user.id)
    .all<
      Omit<CredentialRow, 'token_hash' | 'user_email' | 'user_display_name'>
    >();
  return (rows.results ?? []).map((row) => metadata(row));
}

export async function createScoutIntegrationCredential(
  db: D1Database,
  user: RequestUser,
  input: CreateScoutIntegrationCredentialInput,
  now = Date.now(),
): Promise<CreatedScoutIntegrationCredential> {
  const parsed = createScoutIntegrationCredentialSchema.safeParse(input);
  if (!parsed.success)
    throw new ScoutIntegrationCredentialError('invalid_metadata');
  const credentialInput = parsed.data;
  await ensureUser(db, user);
  const active = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM scout_integration_credentials
       WHERE user_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(user.id, now)
    .first<{ count: number }>();
  if (Number(active?.count ?? 0) >= MAX_ACTIVE_CREDENTIALS)
    throw new ScoutIntegrationCredentialError('credential_limit');
  const expiresAt = credentialInput.expiresAt
    ? Date.parse(credentialInput.expiresAt)
    : null;
  if (expiresAt !== null && expiresAt <= now)
    throw new ScoutIntegrationCredentialError('invalid_expiry');
  const id = crypto.randomUUID();
  const { token, tokenId } = generateScoutIntegrationToken();
  const tokenHash = await hashScoutIntegrationToken(token);
  const scopes = [...new Set(credentialInput.scopes)].sort();
  await db.batch([
    db
      .prepare(
        `INSERT INTO scout_integration_credentials
          (id, user_id, label, token_id, token_hash, oauth_subject,
           scopes_json, created_at, updated_at, expires_at, last_used_at,
           revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(
        id,
        user.id,
        credentialInput.label,
        tokenId,
        tokenHash,
        credentialInput.oauthSubject,
        JSON.stringify(scopes),
        now,
        now,
        expiresAt,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
          (id, user_id, action, target_type, target_id, metadata_json, created_at)
         VALUES (?, ?, 'scout_integration_created',
                 'scout_integration_credential', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({
          label: credentialInput.label,
          tokenId,
          oauthSubject: credentialInput.oauthSubject,
          scopes,
          expiresAt: credentialInput.expiresAt,
        }),
        now,
      ),
  ]);
  return {
    token,
    credential: {
      id,
      label: credentialInput.label,
      tokenId,
      oauthSubject: credentialInput.oauthSubject,
      scopes,
      createdAt: new Date(now).toISOString(),
      expiresAt: iso(expiresAt),
      lastUsedAt: null,
      revokedAt: null,
      status: 'active',
    },
  };
}

export async function revokeScoutIntegrationCredential(
  db: D1Database,
  user: RequestUser,
  credentialId: string,
  now = Date.now(),
): Promise<boolean> {
  if (!CREDENTIAL_ID.test(credentialId)) return false;
  const result = await db
    .prepare(
      `UPDATE scout_integration_credentials
       SET revoked_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(now, now, credentialId, user.id)
    .run();
  const revoked = Number(result.meta?.changes ?? 0) === 1;
  if (revoked)
    await db
      .prepare(
        `INSERT INTO audit_logs
          (id, user_id, action, target_type, target_id, metadata_json, created_at)
         VALUES (?, ?, 'scout_integration_revoked',
                 'scout_integration_credential', ?, '{}', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, credentialId, now)
      .run();
  return revoked;
}

export async function authenticateScoutIntegration(
  db: D1Database,
  request: Request,
  requiredScope: ScoutIntegrationScope,
  now = Date.now(),
): Promise<{ user: RequestUser; credentialId: string }> {
  const parsed = parseScoutIntegrationToken(request);
  if (!parsed)
    throw new ScoutIntegrationAuthenticationError('invalid_credential');
  const row = await db
    .prepare(
      `SELECT c.id, c.user_id, u.email AS user_email,
              u.display_name AS user_display_name, c.label, c.token_id,
              c.token_hash, c.oauth_subject, c.scopes_json, c.created_at,
              c.expires_at, c.last_used_at, c.revoked_at
       FROM scout_integration_credentials c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.token_id = ?
       LIMIT 1`,
    )
    .bind(parsed.tokenId)
    .first<CredentialRow>();
  const receivedHash = await hashScoutIntegrationToken(parsed.token);
  const subject = request.headers.get(SCOUT_INTEGRATION_SUBJECT_HEADER)?.trim();
  const tokenMatches = constantTimeEqualHex(
    receivedHash,
    row?.token_hash ?? UNKNOWN_TOKEN_HASH,
  );
  if (
    !row ||
    !tokenMatches ||
    row.revoked_at !== null ||
    (row.expires_at !== null && row.expires_at <= now) ||
    !subject ||
    !isScoutIntegrationOauthSubject(subject) ||
    subject !== row.oauth_subject
  )
    throw new ScoutIntegrationAuthenticationError('invalid_credential');
  const scopes = parseScoutIntegrationScopes(row.scopes_json);
  if (!scopes.includes(requiredScope))
    throw new ScoutIntegrationAuthenticationError(
      'insufficient_scope',
      requiredScope,
    );
  const used = await db
    .prepare(
      `UPDATE scout_integration_credentials
       SET last_used_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(now, now, row.id, row.user_id, now)
    .run();
  if (Number(used.meta?.changes ?? 0) !== 1)
    throw new ScoutIntegrationAuthenticationError('invalid_credential');
  return {
    credentialId: row.id,
    user: {
      id: row.user_id,
      email: row.user_email,
      displayName: row.user_display_name ?? row.user_email,
    },
  };
}
