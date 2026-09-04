import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  KeepaConnector,
  KeepaRequestError,
  type KeepaProduct,
} from '../../lib/connectors/keepa.ts';

const fixtureDirectory = new URL('../fixtures/keepa/', import.meta.url);

async function fixture(name: string) {
  return JSON.parse(
    await readFile(new URL(name, fixtureDirectory), 'utf8'),
  ) as Record<string, unknown>;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

void test('Keepa connector reports a missing API key without network access', async () => {
  let calls = 0;
  const connector = new KeepaConnector({
    fetchImpl: async () => {
      calls += 1;
      return json({});
    },
  });
  assert.deepEqual(await connector.validateConfig(), {
    valid: false,
    errors: ['KEEPA_API_KEY is required', 'Keepa does not support Amazon NL'],
  });
  const health = await connector.healthCheck();
  assert.equal(health.status, 'key_required');
  assert.equal(calls, 0);
});

void test('valid product response is fetched from the documented product endpoint', async () => {
  const body = await fixture('valid-product.json');
  const requested: URL[] = [];
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async (input) => {
      requested.push(requestUrl(input));
      return json(body);
    },
  });
  const products = await connector.lookupProducts(['B0DPKPRSM1'], 'DE');
  assert.equal(products.length, 1);
  assert.equal(products[0].asin, 'B0DPKPRSM1');
  assert.equal(requested[0]?.origin, 'https://api.keepa.com');
  assert.equal(requested[0]?.pathname, '/product');
  assert.equal(requested[0]?.searchParams.get('domain'), '3');
  assert.equal(requested[0]?.searchParams.get('stats'), '180');
  assert.equal(connector.budget.snapshot().tokensAvailable, 1240);
});

void test('invalid Keepa keys are classified from HTTP 402', async () => {
  const body = await fixture('invalid-key.json');
  const connector = new KeepaConnector({
    apiKey: 'invalid',
    defaultMarketplace: 'DE',
    fetchImpl: async () => json(body, 402),
  });
  await assert.rejects(
    connector.lookupProducts(['B0DPKPRSM1'], 'DE'),
    (error: unknown) =>
      error instanceof KeepaRequestError &&
      error.classification === 'invalid_key',
  );
});

void test('HTTP 429 uses bounded retry and then succeeds', async () => {
  const body = await fixture('valid-product.json');
  let calls = 0;
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? json({ error: { message: 'rate limited' } }, 429, {
            'retry-after': '0',
          })
        : json(body);
    },
  });
  assert.equal(
    (await connector.lookupProducts(['B0DPKPRSM1'], 'DE')).length,
    1,
  );
  assert.equal(calls, 2);
});

void test('token exhaustion skips broad discovery and records the skip', async () => {
  let calls = 0;
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async () => {
      calls += 1;
      return json({
        tokensLeft: 0,
        tokensConsumed: 0,
        refillRate: 5,
        refillIn: 30_000,
      });
    },
  });
  assert.equal((await connector.healthCheck()).ok, true);
  assert.deepEqual(await connector.searchProducts('pokemon tcg', 'DE'), []);
  assert.equal(calls, 1);
  assert.equal(connector.budget.snapshot().skippedRequests, 1);
  assert.ok(connector.budget.snapshot().nextSafeScanAt);
});

void test('missing Keepa products return an empty result', async () => {
  const body = await fixture('missing-product.json');
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async () => json(body),
  });
  assert.deepEqual(await connector.lookupProducts(['B0DPKPRSM1'], 'DE'), []);
});

void test('multiple products preserve missing seller counts without fabrication', async () => {
  const body = await fixture('multiple-products.json');
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'IT',
    fetchImpl: async () => json(body),
  });
  const products = await connector.lookupProducts(
    ['B0DPKPRSM1', 'B0DSTD36IT'],
    'IT',
  );
  const normalized = connector.normaliseProduct(products[1], 'IT');
  assert.equal(normalized.currentPrice, 119.99);
  assert.equal(normalized.sellerCount, null);
  assert.equal(normalized.sellerType, 'UNKNOWN');
});

void test('price-missing product does not normalise into an active offer', async () => {
  const body = await fixture('missing-price.json');
  const product = (body.products as KeepaProduct[])[0];
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'FR',
  });
  const offers = await connector.normalise({
    sourceId: connector.id,
    externalId: 'FR:B0RFTSPFR1',
    capturedAt: '2026-09-04T12:00:00.000Z',
    payload: { marketplace: 'FR', product },
  });
  assert.deepEqual(offers, []);
});

void test('Amazon direct missing stays a third-party or unknown classification', () => {
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
  });
  const thirdParty = connector.normaliseProduct(
    {
      asin: 'B0DPKPRSM1',
      title: 'Pokémon ETB',
      stats: { current: [-1, 5500], buyBoxSellerId: 'SELLER-1' },
      offers: [{ sellerId: 'SELLER-1', isFBA: false, isAmazon: false }],
    },
    'DE',
  );
  assert.equal(thirdParty.sellerType, 'FBM');
  assert.notEqual(thirdParty.sellerType, 'AMAZON_DIRECT');
});

void test('stale Keepa updates remain visibly stale', () => {
  const now = Date.UTC(2026, 8, 4, 12);
  const keepaMinutes = Math.floor(
    (now - 3 * 60 * 60_000) / 60_000 - 21_564_000,
  );
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    now: () => now,
  });
  const normalized = connector.normaliseProduct(
    {
      asin: 'B0DPKPRSM1',
      title: 'Pokémon ETB',
      lastUpdate: keepaMinutes,
      stats: { current: [5500, 5600] },
    },
    'DE',
  );
  assert.equal(normalized.freshness, 'Stale');
  assert.equal(normalized.ageMinutes, 180);
});

void test('price history parses immutable Keepa time/price pairs', async () => {
  const body = await fixture('valid-product.json');
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async () => json(body),
  });
  const history = await connector.getPriceHistory('B0DPKPRSM1', 'DE');
  assert.equal(history.length, 3);
  assert.equal(history.at(-1)?.price, 54.99);
  assert.match(history[0].at, /^20\d\d-/);
});

void test('batch lookup splits more than 100 ASINs into supported batches', async () => {
  const batchSizes: number[] = [];
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async (input) => {
      const url = requestUrl(input);
      const asins = url.searchParams.get('asin')?.split(',') ?? [];
      batchSizes.push(asins.length);
      return json({
        tokensLeft: 1000,
        tokensConsumed: asins.length,
        products: [],
      });
    },
  });
  const asins = Array.from(
    { length: 101 },
    (_, index) => `B${String(index).padStart(9, '0')}`,
  );
  await connector.lookupProducts(asins, 'DE');
  assert.deepEqual(batchSizes, [100, 1]);
});

void test('multiple EU markets use their official Keepa domain IDs', async () => {
  const domains: string[] = [];
  const connector = new KeepaConnector({
    apiKey: 'fixture-key',
    defaultMarketplace: 'DE',
    fetchImpl: async (input) => {
      domains.push(requestUrl(input).searchParams.get('domain') ?? '');
      return json({ tokensLeft: 1000, tokensConsumed: 1, products: [] });
    },
  });
  await connector.lookupProducts(['B0DPKPRSM1'], 'DE');
  await connector.lookupProducts(['B0DPKPRSM1'], 'FR');
  assert.deepEqual(domains, ['3', '4']);
  await assert.rejects(
    connector.lookupProducts(['B0DPKPRSM1'], 'NL'),
    (error: unknown) =>
      error instanceof KeepaRequestError &&
      error.classification === 'invalid_response',
  );
});
