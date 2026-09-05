import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import {
  EbayNotificationKeyUnavailableError,
  InvalidEbayNotificationError,
  marketplaceDeletionChallengeResponse,
  parseMarketplaceAccountDeletionNotification,
  validateMarketplaceDeletionEndpoint,
  validateMarketplaceDeletionHmacSecret,
  validateMarketplaceDeletionVerificationToken,
  verifyEbayNotificationSignature,
} from '@/lib/ebay/marketplace-account-deletion';
import { deleteEbayUserData } from '@/lib/repositories/ebay-account-deletion';

const MAX_NOTIFICATION_BYTES = 65_536;

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function challengeConfiguration() {
  const endpoint = env.EBAY_MARKETPLACE_DELETION_ENDPOINT?.trim();
  const verificationToken =
    env.EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN?.trim();
  if (!endpoint || !verificationToken)
    throw new Error('eBay account-deletion notifications are not configured.');
  return {
    endpoint: validateMarketplaceDeletionEndpoint(endpoint),
    verificationToken:
      validateMarketplaceDeletionVerificationToken(verificationToken),
  };
}

function notificationConfiguration() {
  const challenge = challengeConfiguration();
  const clientId = env.EBAY_CLIENT_ID?.trim();
  const clientSecret = env.EBAY_CLIENT_SECRET?.trim();
  const hmacSecret = env.EBAY_MARKETPLACE_DELETION_HMAC_SECRET?.trim();
  if (!clientId || !clientSecret || !hmacSecret)
    throw new EbayNotificationKeyUnavailableError(
      'eBay account-deletion notification credentials are unavailable.',
    );
  return {
    ...challenge,
    clientId,
    clientSecret,
    hmacSecret: validateMarketplaceDeletionHmacSecret(hmacSecret),
  };
}

export async function GET(request: Request) {
  try {
    const configured = challengeConfiguration();
    const requestUrl = new URL(request.url);
    const callbackUrl = `${requestUrl.origin}${requestUrl.pathname}`;
    if (callbackUrl !== configured.endpoint)
      return noStoreJson({ error: 'Callback endpoint mismatch.' }, 503);
    const challengeCode = requestUrl.searchParams.get('challenge_code');
    if (!challengeCode)
      return noStoreJson({ error: 'challenge_code is required.' }, 400);
    const challengeResponse = await marketplaceDeletionChallengeResponse({
      challengeCode,
      verificationToken: configured.verificationToken,
      endpoint: configured.endpoint,
    });
    return noStoreJson({ challengeResponse });
  } catch {
    return noStoreJson(
      { error: 'eBay account-deletion notifications are unavailable.' },
      503,
    );
  }
}

export async function POST(request: Request) {
  const receivedAt = Date.now();
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_NOTIFICATION_BYTES)
    return noStoreJson({ error: 'Payload too large.' }, 413);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return noStoreJson(
      { error: 'Content-Type must be application/json.' },
      415,
    );

  let body: Uint8Array;
  try {
    body = new Uint8Array(await request.arrayBuffer());
    if (!body.length || body.length > MAX_NOTIFICATION_BYTES)
      return noStoreJson({ error: 'Payload size is invalid.' }, 413);
  } catch {
    return noStoreJson({ error: 'Unable to read notification payload.' }, 400);
  }

  try {
    const configured = notificationConfiguration();
    const signatureHeader = request.headers.get('x-ebay-signature') ?? '';
    const valid = await verifyEbayNotificationSignature({
      body,
      signatureHeader,
      credentials: {
        clientId: configured.clientId,
        clientSecret: configured.clientSecret,
      },
    });
    if (!valid)
      return noStoreJson({ error: 'Invalid notification signature.' }, 412);

    let message: unknown;
    try {
      message = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(body),
      );
    } catch {
      return noStoreJson({ error: 'Invalid JSON payload.' }, 400);
    }
    const notification = parseMarketplaceAccountDeletionNotification(message);
    const summary = await deleteEbayUserData(getD1(), {
      data: notification.notification.data,
      eventDate: notification.notification.eventDate,
      hmacSecret: configured.hmacSecret,
      notificationId: notification.notification.notificationId,
      receivedAt,
      schemaVersion: notification.metadata.schemaVersion,
    });
    console.log(
      JSON.stringify({
        service: 'ebay-account-deletion',
        event: 'user_data_deleted',
        ...summary,
      }),
    );
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof InvalidEbayNotificationError)
      return noStoreJson({ error: 'Invalid notification.' }, 412);
    if (error instanceof EbayNotificationKeyUnavailableError)
      return noStoreJson(
        { error: 'Notification verification is temporarily unavailable.' },
        503,
      );
    return noStoreJson(
      { error: 'Notification processing is temporarily unavailable.' },
      503,
    );
  }
}
