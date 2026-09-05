import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DISCORD_GATEWAY_INTENTS,
  gatewayCloseDisposition,
  gatewayDiscoveryDisposition,
  gatewayHandshakeExpired,
  isPendingExpired,
  reconnectDelayMs,
  validDiscordIngestUrl,
} from '../workers/discord-gateway/protocol.ts';

void test('requests only the Discord intents used by Community Radar', () => {
  assert.equal(DISCORD_GATEWAY_INTENTS, (1 << 0) | (1 << 9) | (1 << 15));
});

void test('classifies fatal and resumable Gateway close codes', () => {
  assert.deepEqual(gatewayCloseDisposition(4004), {
    fatal: true,
    clearSession: true,
    status: 'authentication_failed',
  });
  assert.deepEqual(gatewayCloseDisposition(4014), {
    fatal: true,
    clearSession: true,
    status: 'permission_required',
  });
  assert.deepEqual(gatewayCloseDisposition(4007), {
    fatal: false,
    clearSession: true,
    status: 'disconnected',
  });
  assert.deepEqual(gatewayCloseDisposition(1000), {
    fatal: false,
    clearSession: true,
    status: 'disconnected',
  });
});

void test('uses bounded exponential reconnect delays', () => {
  assert.equal(reconnectDelayMs(0, 0), 2_000);
  assert.equal(reconnectDelayMs(3, 0.5), 16_500);
  assert.equal(reconnectDelayMs(99, 1), 60_000);
});

void test('backs off discovery rate limits and cools down bad credentials', () => {
  assert.deepEqual(gatewayDiscoveryDisposition(401, null), {
    fatal: true,
    status: 'authentication_failed',
    retryAfterMs: null,
  });
  assert.deepEqual(gatewayDiscoveryDisposition(429, '12.5'), {
    fatal: false,
    status: 'disconnected',
    retryAfterMs: 12_500,
  });
  assert.equal(
    gatewayDiscoveryDisposition(429, '9999').retryAfterMs,
    15 * 60_000,
  );
});

void test('expires stalled Gateway handshakes but never a READY session', () => {
  const now = Date.UTC(2026, 8, 5, 12);
  assert.equal(gatewayHandshakeExpired(now - 19_999, 0, 0, now), false);
  assert.equal(gatewayHandshakeExpired(now - 20_000, 0, 0, now), true);
  assert.equal(
    gatewayHandshakeExpired(now - 60_000, now - 29_999, 0, now),
    false,
  );
  assert.equal(
    gatewayHandshakeExpired(now - 60_000, now - 30_000, 0, now),
    true,
  );
  assert.equal(
    gatewayHandshakeExpired(now - 60_000, now - 40_000, now - 10_000, now),
    false,
  );
});

void test('expires only old or malformed pending deliveries', () => {
  const now = Date.UTC(2026, 8, 5, 12);
  assert.equal(isPendingExpired(now - 1_000, now), false);
  assert.equal(isPendingExpired(now - 24 * 60 * 60 * 1_000, now), true);
  assert.equal(isPendingExpired(Number.NaN, now), true);
});

void test('accepts only the HTTPS Community Radar ingestion route', () => {
  assert.equal(
    validDiscordIngestUrl('https://example.test/api/community/discord/events'),
    true,
  );
  assert.equal(
    validDiscordIngestUrl('http://example.test/api/community/discord/events'),
    false,
  );
  assert.equal(validDiscordIngestUrl('https://example.test/other'), false);
  assert.equal(
    validDiscordIngestUrl(
      'https://user:secret@example.test/api/community/discord/events',
    ),
    false,
  );
});
