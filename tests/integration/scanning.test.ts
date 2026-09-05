import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectorRegistry,
  getConnector,
  getEnabledConnectors,
} from '../../lib/connectors/registry.ts';
import { FixtureConnector } from '../fixtures/connector.ts';
import { PRODUCT_IDENTITIES } from '../../lib/product-identities.ts';
import { createCartToken } from '../../lib/services/cart-token.ts';
import {
  matchNormalisedOffer,
  runConfiguredScan,
} from '../../lib/services/scanning.ts';

void test('runtime connector registry never exposes the test fixture adapter', () => {
  assert.equal(
    connectorRegistry.some((connector) => connector.id === 'fixture-market'),
    false,
  );
  assert.equal(getConnector('fixture-market'), null);
  assert.equal(
    getEnabledConnectors().some(
      (connector) => connector.id === 'fixture-market',
    ),
    false,
  );
});

void test('the production identity catalog contains no market or financial evidence', () => {
  const allowedKeys = [
    'aliases',
    'canonicalName',
    'game',
    'id',
    'language',
    'productType',
    'requiredTokens',
    'setName',
  ];
  for (const identity of PRODUCT_IDENTITIES) {
    assert.deepEqual(Object.keys(identity).sort(), allowedKeys);
    assert.doesNotMatch(
      JSON.stringify(identity),
      /seller|listing|price|shipping|profit|roi|valuation|sale evidence/i,
    );
  }
});

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
  const summary = await runConfiguredScan(
    ['pokemon'],
    [new FixtureConnector()],
  );
  assert.equal(summary.connectors.length, 1);
  assert.equal(summary.connectors[0]?.source, 'fixture-market');
  assert.equal(
    summary.connectors[0]?.fetched,
    summary.connectors[0]?.normalised,
  );
  assert.deepEqual(summary.connectors[0]?.errors, []);
});

void test('real marketplace matching uses neutral identity data', () => {
  const match = matchNormalisedOffer({
    sourceId: 'ebay',
    externalId: '123456789012',
    sourceListingId: '123456789012',
    sourceMarketplace: 'ebay',
    title: 'Pokémon Prismatic Evolutions ETB sealed English',
    url: 'https://www.ebay.nl/itm/123456789012',
    sourceListingUrl: 'https://www.ebay.nl/itm/123456789012',
    detectedAt: '2026-09-05T10:00:00.000Z',
    lastVerifiedAt: '2026-09-05T10:00:00.000Z',
    availabilityStatus: 'available',
    itemPrice: 59.95,
    shipping: 6.95,
    currency: 'EUR',
    quantity: 1,
    condition: 'New',
    language: 'English',
    seller: 'market-seller',
    available: true,
  });
  assert.equal(match?.productIdentityId, 'pokemon-prismatic-evolutions-etb');
  assert.ok((match?.confidence ?? 0) >= 80);
});

void test('generic marketplace titles do not guess a product identity', () => {
  const offer = {
    sourceId: 'ebay',
    externalId: '123456789013',
    sourceListingId: '123456789013',
    sourceMarketplace: 'ebay',
    title: 'Riftbound booster display sealed',
    url: 'https://www.ebay.nl/itm/123456789013',
    sourceListingUrl: 'https://www.ebay.nl/itm/123456789013',
    detectedAt: '2026-09-05T10:00:00.000Z',
    lastVerifiedAt: '2026-09-05T10:00:00.000Z',
    availabilityStatus: 'available' as const,
    itemPrice: 59.95,
    shipping: 6.95,
    currency: 'EUR',
    quantity: 1,
    condition: 'New',
    language: 'English',
    seller: 'market-seller',
    available: true,
  };
  assert.equal(matchNormalisedOffer(offer), null);
});

void test('cart handoff allowlists domains and creates an expiring signed token', async () => {
  const result = await createCartToken(
    {
      domain: 'www.ebay.nl',
      dealId: 'd1',
      expectedTitle: 'Verified product',
      expectedPrice: 125,
      priceTolerance: 0,
      quantity: 1,
    },
    'test-signing-secret',
  );
  assert.match(result.token, /^v1\./);
  assert.ok(result.intent.expiresAt > Date.now());
  await assert.rejects(
    () =>
      createCartToken(
        {
          domain: '127.0.0.1',
          dealId: 'd1',
          expectedTitle: 'Bad target',
          expectedPrice: 10,
          priceTolerance: 0,
          quantity: 1,
        },
        'test-signing-secret',
      ),
    /allowlisted/,
  );
});
