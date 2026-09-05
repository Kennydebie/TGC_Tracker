import { createHmac, createVerify } from 'node:crypto';

const PRODUCTION_IDENTITY_ENDPOINT =
  'https://api.ebay.com/identity/v1/oauth2/token';
const PRODUCTION_PUBLIC_KEY_ENDPOINT =
  'https://api.ebay.com/commerce/notification/v1/public_key/';
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_SIGNATURE_HEADER_LENGTH = 8_192;

export type EbayMarketplaceAccountDeletionData = {
  username?: string;
  userId?: string;
  eiasToken?: string;
};

export type EbayMarketplaceAccountDeletionNotification = {
  metadata: {
    topic: 'MARKETPLACE_ACCOUNT_DELETION';
    schemaVersion: string;
    deprecated: boolean;
  };
  notification: {
    notificationId: string;
    eventDate: string;
    publishDate: string;
    publishAttemptCount: number;
    data: EbayMarketplaceAccountDeletionData;
  };
};

export type EbayNotificationCredentials = {
  clientId: string;
  clientSecret: string;
};

export type EbaySuppressionFingerprint = {
  fingerprint: string;
  identityType: 'eias' | 'user_id' | 'username';
};

type SignatureEnvelope = {
  alg: 'ECDSA';
  kid: string;
  signature: string;
  digest: 'SHA1';
};

type PublicKeyResponse = {
  algorithm: string;
  digest: string;
  key: string;
};

type CachedPublicKey = {
  expiresAt: number;
  key: string;
};

const publicKeyCache = new Map<string, CachedPublicKey>();

export class InvalidEbayNotificationError extends Error {}

export class EbayNotificationKeyUnavailableError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, name: string, maximum: number) {
  if (typeof value !== 'string')
    throw new InvalidEbayNotificationError(`${name} must be a string.`);
  const result = value.trim();
  if (!result || result.length > maximum)
    throw new InvalidEbayNotificationError(`${name} is invalid.`);
  return result;
}

function optionalBoundedString(
  value: unknown,
  name: string,
  maximum: number,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return boundedString(value, name, maximum);
}

function validDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function parseMarketplaceAccountDeletionNotification(
  value: unknown,
): EbayMarketplaceAccountDeletionNotification {
  if (!isRecord(value) || !isRecord(value.metadata))
    throw new InvalidEbayNotificationError('Notification metadata is missing.');
  if (!isRecord(value.notification) || !isRecord(value.notification.data))
    throw new InvalidEbayNotificationError('Notification data is missing.');

  const topic = boundedString(value.metadata.topic, 'metadata.topic', 80);
  if (topic !== 'MARKETPLACE_ACCOUNT_DELETION')
    throw new InvalidEbayNotificationError('Notification topic is invalid.');
  boundedString(value.metadata.schemaVersion, 'metadata.schemaVersion', 32);
  if (typeof value.metadata.deprecated !== 'boolean')
    throw new InvalidEbayNotificationError(
      'metadata.deprecated must be a boolean.',
    );

  boundedString(
    value.notification.notificationId,
    'notification.notificationId',
    256,
  );
  const eventDate = boundedString(
    value.notification.eventDate,
    'notification.eventDate',
    80,
  );
  const publishDate = boundedString(
    value.notification.publishDate,
    'notification.publishDate',
    80,
  );
  if (!validDate(eventDate) || !validDate(publishDate))
    throw new InvalidEbayNotificationError('Notification date is invalid.');
  const publishAttemptCount = value.notification.publishAttemptCount;
  if (
    !Number.isSafeInteger(publishAttemptCount) ||
    Number(publishAttemptCount) < 0
  )
    throw new InvalidEbayNotificationError(
      'notification.publishAttemptCount is invalid.',
    );

  const username = optionalBoundedString(
    value.notification.data.username,
    'notification.data.username',
    512,
  );
  const userId = optionalBoundedString(
    value.notification.data.userId,
    'notification.data.userId',
    512,
  );
  const eiasToken = optionalBoundedString(
    value.notification.data.eiasToken,
    'notification.data.eiasToken',
    2_048,
  );
  if (!username && !userId && !eiasToken)
    throw new InvalidEbayNotificationError(
      'Notification has no eBay user identifier.',
    );

  // Preserve the parsed object's property order and any future fields because
  // eBay signs the received JSON bytes, not a reconstructed subset.
  return value as unknown as EbayMarketplaceAccountDeletionNotification;
}

export function validateMarketplaceDeletionVerificationToken(value: string) {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(token))
    throw new Error(
      'EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN must be 32-80 characters using only letters, numbers, underscores, or hyphens.',
    );
  return token;
}

export function validateMarketplaceDeletionHmacSecret(value: string) {
  const secret = value.trim();
  if (secret.length < 32 || secret.length > 256)
    throw new Error(
      'EBAY_MARKETPLACE_DELETION_HMAC_SECRET must be 32-256 characters.',
    );
  return secret;
}

export function ebayIdentityDataFromListing(input: {
  payload: unknown;
  seller?: string | null;
}): EbayMarketplaceAccountDeletionData {
  const payload = isRecord(input.payload) ? input.payload : {};
  const sellerPayload = isRecord(payload.seller) ? payload.seller : {};
  return {
    username:
      optionalBoundedString(input.seller, 'seller', 512) ??
      optionalBoundedString(sellerPayload.username, 'seller.username', 512),
    userId: optionalBoundedString(sellerPayload.userId, 'seller.userId', 512),
    eiasToken: optionalBoundedString(
      sellerPayload.eiasToken,
      'seller.eiasToken',
      2_048,
    ),
  };
}

export function ebaySuppressionFingerprints(
  hmacSecret: string,
  data: EbayMarketplaceAccountDeletionData,
): EbaySuppressionFingerprint[] {
  const secret = validateMarketplaceDeletionHmacSecret(hmacSecret);
  const values: Array<{
    identityType: EbaySuppressionFingerprint['identityType'];
    value: string;
  }> = [];
  if (data.username?.trim())
    values.push({
      identityType: 'username',
      value: data.username.trim().toLocaleLowerCase('en-US'),
    });
  if (data.userId?.trim())
    values.push({
      identityType: 'user_id',
      value: data.userId.trim().toLocaleLowerCase('en-US'),
    });
  if (data.eiasToken?.trim())
    values.push({ identityType: 'eias', value: data.eiasToken.trim() });
  return values.map(({ identityType, value }) => ({
    identityType,
    fingerprint: createHmac('sha256', secret)
      .update(`ebay-deletion:v1\0${identityType}\0${value}`, 'utf8')
      .digest('hex'),
  }));
}

export function validateMarketplaceDeletionEndpoint(value: string) {
  const endpoint = value.trim();
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(
      'EBAY_MARKETPLACE_DELETION_ENDPOINT must be a valid HTTPS URL.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'EBAY_MARKETPLACE_DELETION_ENDPOINT must be a public HTTPS URL without credentials, a query, or a fragment.',
    );
  return url.toString();
}

export async function marketplaceDeletionChallengeResponse(input: {
  challengeCode: string;
  verificationToken: string;
  endpoint: string;
}) {
  const challengeCode = boundedString(
    input.challengeCode,
    'challenge_code',
    1_024,
  );
  const verificationToken = validateMarketplaceDeletionVerificationToken(
    input.verificationToken,
  );
  const endpoint = validateMarketplaceDeletionEndpoint(input.endpoint);
  const bytes = new TextEncoder().encode(
    `${challengeCode}${verificationToken}${endpoint}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseSignatureEnvelope(value: string): SignatureEnvelope {
  if (
    !value ||
    value.length > MAX_SIGNATURE_HEADER_LENGTH ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new InvalidEbayNotificationError('X-EBAY-SIGNATURE is malformed.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(value));
  } catch {
    throw new InvalidEbayNotificationError('X-EBAY-SIGNATURE is malformed.');
  }
  if (!isRecord(parsed))
    throw new InvalidEbayNotificationError('X-EBAY-SIGNATURE is malformed.');
  const alg = boundedString(parsed.alg, 'signature.alg', 16).toUpperCase();
  const digest = boundedString(
    parsed.digest,
    'signature.digest',
    16,
  ).toUpperCase();
  const kid = boundedString(parsed.kid, 'signature.kid', 128);
  const signature = boundedString(
    parsed.signature,
    'signature.signature',
    4_096,
  );
  if (
    alg !== 'ECDSA' ||
    digest !== 'SHA1' ||
    !/^[A-Za-z0-9._-]+$/.test(kid) ||
    signature.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
  )
    throw new InvalidEbayNotificationError(
      'X-EBAY-SIGNATURE uses unsupported values.',
    );
  return { alg: 'ECDSA', digest: 'SHA1', kid, signature };
}

async function applicationAccessToken(
  credentials: EbayNotificationCredentials,
  fetchImpl: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetchImpl(PRODUCTION_IDENTITY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EbayNotificationKeyUnavailableError(
      'eBay OAuth is temporarily unavailable.',
    );
  }
  if (!response.ok)
    throw new EbayNotificationKeyUnavailableError(
      `eBay OAuth returned HTTP ${response.status}.`,
    );
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || !body.access_token)
    throw new EbayNotificationKeyUnavailableError(
      'eBay OAuth returned no access token.',
    );
  return body.access_token;
}

function cachePublicKey(cacheKey: string, key: string) {
  if (publicKeyCache.size >= 32) {
    const oldest = publicKeyCache.keys().next().value as string | undefined;
    if (oldest) publicKeyCache.delete(oldest);
  }
  publicKeyCache.set(cacheKey, {
    expiresAt: Date.now() + PUBLIC_KEY_CACHE_TTL_MS,
    key,
  });
}

async function publicKeyFor(
  keyId: string,
  credentials: EbayNotificationCredentials,
  fetchImpl: typeof fetch,
) {
  const cacheKey = `production:${keyId}`;
  const cached = publicKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  if (cached) publicKeyCache.delete(cacheKey);

  const token = await applicationAccessToken(credentials, fetchImpl);
  let response: Response;
  try {
    response = await fetchImpl(
      `${PRODUCTION_PUBLIC_KEY_ENDPOINT}${encodeURIComponent(keyId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new EbayNotificationKeyUnavailableError(
      'The eBay notification public key is temporarily unavailable.',
    );
  }
  if (response.status === 400 || response.status === 404)
    throw new InvalidEbayNotificationError(
      'X-EBAY-SIGNATURE references an unknown public key.',
    );
  if (!response.ok)
    throw new EbayNotificationKeyUnavailableError(
      `The eBay notification public-key API returned HTTP ${response.status}.`,
    );
  const body = (await response.json()) as Partial<PublicKeyResponse>;
  if (
    body.algorithm?.toUpperCase() !== 'ECDSA' ||
    body.digest?.toUpperCase() !== 'SHA1' ||
    typeof body.key !== 'string' ||
    body.key.length > 8_192 ||
    !body.key.includes('-----BEGIN PUBLIC KEY-----') ||
    !body.key.includes('-----END PUBLIC KEY-----')
  )
    throw new EbayNotificationKeyUnavailableError(
      'The eBay notification public key response is invalid.',
    );
  const key = body.key
    .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
    .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
  cachePublicKey(cacheKey, key);
  return key;
}

export async function verifyEbayNotificationSignature(input: {
  body: Uint8Array;
  signatureHeader: string;
  credentials: EbayNotificationCredentials;
  fetchImpl?: typeof fetch;
}) {
  const envelope = parseSignatureEnvelope(input.signatureHeader);
  const publicKey = await publicKeyFor(
    envelope.kid,
    input.credentials,
    input.fetchImpl ?? fetch,
  );
  try {
    const verifier = createVerify('ssl3-sha1');
    verifier.update(input.body);
    verifier.end();
    return verifier.verify(publicKey, envelope.signature, 'base64');
  } catch {
    return false;
  }
}

export function clearEbayPublicKeyCacheForTests() {
  publicKeyCache.clear();
}
