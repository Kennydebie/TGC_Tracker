import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearEbayPublicKeyCacheForTests,
  ebaySuppressionFingerprints,
  InvalidEbayNotificationError,
  marketplaceDeletionChallengeResponse,
  parseMarketplaceAccountDeletionNotification,
  validateMarketplaceDeletionEndpoint,
  validateMarketplaceDeletionHmacSecret,
  validateMarketplaceDeletionVerificationToken,
  verifyEbayNotificationSignature,
} from '../lib/ebay/marketplace-account-deletion.ts';

// eBay's published Node SDK fixture. Keep this as an exact compact JSON string:
// the corresponding X-EBAY-SIGNATURE covers these bytes, not parsed JSON.
// https://github.com/eBay/event-notification-nodejs-sdk/blob/main/test/test.json
const OFFICIAL_EBAY_BODY =
  '{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION","schemaVersion":"1.0","deprecated":false},' +
  '"notification":{"notificationId":"49feeaeb-4982-42d9-a377-9645b8479411_33f7e043-fed8-442b-9d44-791923bd9a6d",' +
  '"eventDate":"2021-03-19T20:43:59.462Z","publishDate":"2021-03-19T20:43:59.679Z",' +
  '"publishAttemptCount":1,"data":{"username":"test_user","userId":"ma8vp1jySJC",' +
  '"eiasToken":"nY+sHZ2PrBmdj6wVnY+sEZ2PrA2dj6wJnY+gAZGEpwmdj6x9nY+seQ=="}}}';

const OFFICIAL_EBAY_SIGNATURE =
  'eyJhbGciOiJlY2RzYSIsImtpZCI6Ijk5MzYyNjFhLTdkN2ItNDYyMS1hMGYxLTk2Y2NiNDI4YWY0OSIsInNpZ25hdHVyZSI6Ik1FWUNJUUNmeGZJV3V4bVdjSUJRSjljNS9YN2lHREpxczJSQ0dzQkVhQWppbnlycmZBSWhBSVY2d0djVGlCdVY1S0pVaWYyaG9reXJMK1E5c3NIa2FkK214Mm5FRTI1dyIsImRpZ2VzdCI6IlNIQTEifQ==';

const OFFICIAL_EBAY_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEZhhxXKtR+TOvtDbgTPCkSof02qgBB7IsYOyf76ilExJ/upAa/vKIKheOoCyOpcLmi4t0b4uepb7LLjmMr90FUg==-----END PUBLIC KEY-----';

const credentials = {
  clientId: 'fixture-client-id',
  clientSecret: 'fixture-client-secret',
};

function officialEbayFetch() {
  const requests: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input;
    requests.push(url);
    if (url === 'https://api.ebay.com/identity/v1/oauth2/token')
      return Response.json({ access_token: 'fixture-access-token' });
    if (
      url ===
      'https://api.ebay.com/commerce/notification/v1/public_key/9936261a-7d7b-4621-a0f1-96ccb428af49'
    )
      return Response.json({
        key: OFFICIAL_EBAY_PUBLIC_KEY,
        algorithm: 'ECDSA',
        digest: 'SHA1',
      });
    throw new Error(`Unexpected fixture request: ${url}`);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

void test('generates the eBay challenge hash in the required order', async () => {
  const challengeResponse = await marketplaceDeletionChallengeResponse({
    challengeCode: 'challenge-123',
    verificationToken: '71745723-d031-455c-bfa5-f90d11b4f20a',
    endpoint: 'https://example.com/api/ebay/account-deletion',
  });

  assert.equal(
    challengeResponse,
    'a4a75007cfe6fe6e9bdcc497adce2d1f349109ff5f55a3d62a094a324142b067',
  );
});

void test('validates endpoint secrets and the account-deletion payload', () => {
  const verificationToken = '71745723-d031-455c-bfa5-f90d11b4f20a';
  const hmacSecret = '0123456789abcdef0123456789abcdef';
  assert.equal(
    validateMarketplaceDeletionVerificationToken(verificationToken),
    verificationToken,
  );
  assert.equal(validateMarketplaceDeletionHmacSecret(hmacSecret), hmacSecret);
  assert.equal(
    validateMarketplaceDeletionEndpoint(
      'https://example.com/api/ebay/account-deletion',
    ),
    'https://example.com/api/ebay/account-deletion',
  );
  assert.throws(
    () => validateMarketplaceDeletionVerificationToken('too-short'),
    /32-80 characters/,
  );
  assert.throws(
    () => validateMarketplaceDeletionEndpoint('http://example.com/webhook'),
    /public HTTPS URL/,
  );

  const parsed = parseMarketplaceAccountDeletionNotification(
    JSON.parse(OFFICIAL_EBAY_BODY),
  );
  assert.equal(parsed.metadata.topic, 'MARKETPLACE_ACCOUNT_DELETION');
  assert.equal(parsed.notification.data.userId, 'ma8vp1jySJC');

  const wrongTopic = JSON.parse(OFFICIAL_EBAY_BODY) as {
    metadata: { topic: string };
  };
  wrongTopic.metadata.topic = 'OTHER_TOPIC';
  assert.throws(
    () => parseMarketplaceAccountDeletionNotification(wrongTopic),
    InvalidEbayNotificationError,
  );
});

void test('verifies the official eBay signature over the exact raw bytes', async () => {
  clearEbayPublicKeyCacheForTests();
  const { fetchImpl, requests } = officialEbayFetch();

  assert.equal(
    await verifyEbayNotificationSignature({
      body: new TextEncoder().encode(OFFICIAL_EBAY_BODY),
      signatureHeader: OFFICIAL_EBAY_SIGNATURE,
      credentials,
      fetchImpl,
    }),
    true,
  );
  assert.deepEqual(requests, [
    'https://api.ebay.com/identity/v1/oauth2/token',
    'https://api.ebay.com/commerce/notification/v1/public_key/9936261a-7d7b-4621-a0f1-96ccb428af49',
  ]);
});

void test('rejects semantically identical JSON when its signed bytes are changed', async () => {
  clearEbayPublicKeyCacheForTests();
  const { fetchImpl } = officialEbayFetch();
  const tamperedBody = OFFICIAL_EBAY_BODY.replace(
    '"schemaVersion":"1.0"',
    '"schemaVersion": "1.0"',
  );
  assert.deepEqual(JSON.parse(tamperedBody), JSON.parse(OFFICIAL_EBAY_BODY));

  assert.equal(
    await verifyEbayNotificationSignature({
      body: new TextEncoder().encode(tamperedBody),
      signatureHeader: OFFICIAL_EBAY_SIGNATURE,
      credentials,
      fetchImpl,
    }),
    false,
  );
});

void test('normalizes identifiers within type and preserves typed separation', () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const username = ebaySuppressionFingerprints(secret, {
    username: '  Test_User  ',
  });
  const normalizedUsername = ebaySuppressionFingerprints(secret, {
    username: 'test_user',
  });
  const userId = ebaySuppressionFingerprints(secret, { userId: 'test_user' });
  assert.deepEqual(username, normalizedUsername);
  assert.equal(username[0]?.identityType, 'username');
  assert.equal(userId[0]?.identityType, 'user_id');
  assert.match(username[0]?.fingerprint ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(username[0]?.fingerprint, userId[0]?.fingerprint);

  const eias = ebaySuppressionFingerprints(secret, {
    eiasToken: '  nY+sToken==  ',
  });
  const lowerCaseEias = ebaySuppressionFingerprints(secret, {
    eiasToken: 'ny+stoken==',
  });
  assert.deepEqual(eias, [
    {
      identityType: 'eias',
      fingerprint:
        '7e7de5b11cd32a4e9bdbb06958dfba29a0e4ba098292ec0b5bb91259487c625a',
    },
  ]);
  assert.notEqual(eias[0]?.fingerprint, lowerCaseEias[0]?.fingerprint);
});
