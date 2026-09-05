import { z } from 'zod';

export const SCOUT_INTEGRATION_SCOPES = ['scout:read', 'scout:write'] as const;
export type ScoutIntegrationScope = (typeof SCOUT_INTEGRATION_SCOPES)[number];

export const SCOUT_INTEGRATION_SUBJECT_HEADER = 'x-tcg-scout-oauth-subject';
export const SCOUT_INTEGRATION_TOKEN_PREFIX = 'tcs_int_';

const TOKEN_ID_BYTES = 18;
const TOKEN_SECRET_BYTES = 32;
const DUMMY_TOKEN_HASH = '1'.repeat(64);

const githubSubject = z.string().regex(/^github:[1-9][0-9]{0,19}$/);

export const createScoutIntegrationCredentialSchema = z
  .object({
    label: z.string().trim().min(1).max(100).default('ChatGPT Community Scout'),
    oauthSubject: githubSubject,
    scopes: z
      .array(z.enum(SCOUT_INTEGRATION_SCOPES))
      .min(1)
      .max(SCOUT_INTEGRATION_SCOPES.length)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Scopes must be unique.',
      })
      .default([...SCOUT_INTEGRATION_SCOPES]),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();

export type CreateScoutIntegrationCredentialInput = z.input<
  typeof createScoutIntegrationCredentialSchema
>;

export type ScoutIntegrationCredentialMetadata = {
  id: string;
  label: string;
  tokenId: string;
  oauthSubject: string;
  scopes: ScoutIntegrationScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
};

export type CreatedScoutIntegrationCredential = {
  credential: ScoutIntegrationCredentialMetadata;
  /** The bearer token is returned only at creation and is never persisted. */
  token: string;
};

export class ScoutIntegrationCredentialError extends Error {
  readonly code: 'credential_limit' | 'invalid_expiry' | 'invalid_metadata';
  readonly status: 400 | 409;

  constructor(
    code: 'credential_limit' | 'invalid_expiry' | 'invalid_metadata',
  ) {
    super(code);
    this.name = 'ScoutIntegrationCredentialError';
    this.code = code;
    this.status = code === 'credential_limit' ? 409 : 400;
  }
}

export class ScoutIntegrationAuthenticationError extends Error {
  readonly status: 401 | 403;
  readonly code: 'invalid_credential' | 'insufficient_scope';
  readonly requiredScope: ScoutIntegrationScope | null;

  constructor(
    code: 'invalid_credential' | 'insufficient_scope',
    requiredScope: ScoutIntegrationScope | null = null,
  ) {
    super(code);
    this.name = 'ScoutIntegrationAuthenticationError';
    this.code = code;
    this.status = code === 'insufficient_scope' ? 403 : 401;
    this.requiredScope = requiredScope;
  }
}

export function parseScoutIntegrationToken(request: Request): {
  token: string;
  tokenId: string;
} | null {
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization.length > 256) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) return null;
  const token = match[1];
  const tokenMatch =
    /^tcs_int_([A-Za-z0-9_-]{20,64})\.([A-Za-z0-9_-]{43,128})$/.exec(token);
  return tokenMatch ? { token, tokenId: tokenMatch[1] } : null;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function generateScoutIntegrationToken(): {
  token: string;
  tokenId: string;
} {
  const idBytes = new Uint8Array(TOKEN_ID_BYTES);
  const secretBytes = new Uint8Array(TOKEN_SECRET_BYTES);
  crypto.getRandomValues(idBytes);
  crypto.getRandomValues(secretBytes);
  const generatedTokenId = base64Url(idBytes);
  return {
    tokenId: generatedTokenId,
    token: `${SCOUT_INTEGRATION_TOKEN_PREFIX}${generatedTokenId}.${base64Url(secretBytes)}`,
  };
}

export async function hashScoutIntegrationToken(
  token: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function decodeHash(value: string, fallback: string): Uint8Array {
  const valid = /^[a-f0-9]{64}$/;
  const normalized = valid.test(value) ? value : fallback;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    );
  return bytes;
}

type TimingSafeSubtleCrypto = SubtleCrypto & {
  timingSafeEqual?: (left: ArrayBufferView, right: ArrayBufferView) => boolean;
};

export function constantTimeEqualHex(left: string, right: string): boolean {
  const valid = /^[a-f0-9]{64}$/;
  const bothValid = valid.test(left) && valid.test(right);
  const leftBytes = decodeHash(left, '0'.repeat(64));
  const rightBytes = decodeHash(right, DUMMY_TOKEN_HASH);
  let equal: boolean;
  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === 'function') {
    equal = subtle.timingSafeEqual(leftBytes, rightBytes);
  } else {
    // Node's Web Crypto does not expose Cloudflare's timingSafeEqual extension.
    let difference = 0;
    for (let index = 0; index < leftBytes.length; index += 1)
      difference |= leftBytes[index] ^ rightBytes[index];
    equal = difference === 0;
  }
  return bothValid && equal;
}

export function parseScoutIntegrationScopes(
  value: string,
): ScoutIntegrationScope[] {
  try {
    const parsed = z
      .array(z.enum(SCOUT_INTEGRATION_SCOPES))
      .safeParse(JSON.parse(value));
    return parsed.success ? [...new Set(parsed.data)].sort() : [];
  } catch {
    return [];
  }
}

export function isScoutIntegrationOauthSubject(value: string): boolean {
  return githubSubject.safeParse(value).success;
}

export function scoutIntegrationAuthResponse(
  error: ScoutIntegrationAuthenticationError,
): Response {
  const attributes = [
    'realm="TCG Scout Community Scout"',
    `error="${
      error.code === 'insufficient_scope'
        ? 'insufficient_scope'
        : 'invalid_token'
    }"`,
  ];
  if (error.requiredScope) attributes.push(`scope="${error.requiredScope}"`);
  return scoutIntegrationJsonResponse(
    {
      error: error.code,
      message:
        error.code === 'insufficient_scope'
          ? 'This integration credential does not allow that operation.'
          : 'A valid TCG Scout integration credential is required.',
    },
    {
      status: error.status,
      headers: {
        'www-authenticate': `Bearer ${attributes.join(', ')}`,
      },
    },
  );
}

export class ScoutIntegrationRequestError extends Error {
  readonly code:
    | 'invalid_json'
    | 'payload_too_large'
    | 'unsupported_media_type';
  readonly status: 400 | 413 | 415;

  constructor(
    code: 'invalid_json' | 'payload_too_large' | 'unsupported_media_type',
  ) {
    super(code);
    this.name = 'ScoutIntegrationRequestError';
    this.code = code;
    this.status =
      code === 'payload_too_large'
        ? 413
        : code === 'unsupported_media_type'
          ? 415
          : 400;
  }
}

export function scoutIntegrationJsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'private, no-store');
  return Response.json(body, { ...init, headers });
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new RangeError('maximumBytes');
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType))
    throw new ScoutIntegrationRequestError('unsupported_media_type');
  const declaredHeader = request.headers.get('content-length');
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && Number.isFinite(declared) && declared > maximumBytes)
    throw new ScoutIntegrationRequestError('payload_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new ScoutIntegrationRequestError('invalid_json');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      try {
        await reader.cancel();
      } catch {
        // The size failure remains the useful client-facing error.
      }
      throw new ScoutIntegrationRequestError('payload_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ScoutIntegrationRequestError('invalid_json');
  }
}
