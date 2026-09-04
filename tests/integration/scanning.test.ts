import assert from 'node:assert/strict';
import test from 'node:test';

import { FixtureConnector } from '../../lib/connectors/fixtures.ts';
import { createCartToken } from '../../lib/services/cart-token.ts';
import { runFixtureScan } from '../../lib/services/scanning.ts';

void test('fixture connector scans and normalises without live network access', async () => {
  const connector = new FixtureConnector();
  const health = await connector.healthCheck();
  const raw = await connector.scan({ query: 'pokemon', limit: 10 });
  const normalised = (
    await Promise.all(raw.map((record) => connector.normalise(record)))
  ).flat();
  assert.equal(health.ok, true);
  assert.equal(raw.length, 1);
  assert.equal(normalised[0]?.currency, 'EUR');
  assert.equal(normalised[0]?.available, true);
  assert.match(connector.getPolicy().notes, /fictional/i);
});

void test('scan orchestration isolates fixture source and reports counts', async () => {
  const summary = await runFixtureScan('pokemon');
  assert.equal(summary.connectors.length, 1);
  assert.equal(summary.connectors[0]?.source, 'fixture-market');
  assert.equal(
    summary.connectors[0]?.fetched,
    summary.connectors[0]?.normalised,
  );
  assert.deepEqual(summary.connectors[0]?.errors, []);
});

void test('cart handoff allowlists domains and creates an expiring demo token', async () => {
  const result = await createCartToken({
    domain: 'demo.invalid',
    dealId: 'd1',
    expectedTitle: 'Verified product',
    expectedPrice: 125,
    priceTolerance: 0,
    quantity: 1,
  });
  assert.match(result.token, /^demo\./);
  assert.equal(result.intent.demo, true);
  assert.ok(result.intent.expiresAt > Date.now());
  await assert.rejects(
    () =>
      createCartToken({
        domain: '127.0.0.1',
        dealId: 'd1',
        expectedTitle: 'Bad target',
        expectedPrice: 10,
        priceTolerance: 0,
        quantity: 1,
      }),
    /allowlisted/,
  );
});
