import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCardmarketPriceGuide,
  validateOfficialCardmarketUrl,
} from '../../lib/connectors/cardmarket-public.ts';
import { EbayBrowseConnector } from '../../lib/connectors/ebay.ts';
import { MarktplaatsPublicConnector } from '../../lib/connectors/marktplaats-public.ts';

void test('eBay connector reports missing credentials and normalises an official response shape', async () => {
  const connector = new EbayBrowseConnector({});
  assert.equal((await connector.validateConfig()).valid, false);
  const offers = await connector.normalise({
    sourceId: 'ebay',
    externalId: 'v1|123|0',
    capturedAt: new Date().toISOString(),
    payload: {
      title: 'Verified sealed display',
      itemWebUrl: 'https://www.ebay.nl/itm/123',
      price: { value: '139.00', currency: 'EUR' },
      shippingOptions: [{ shippingCost: { value: '8.00' } }],
      seller: { username: 'trusted' },
      condition: 'New',
    },
  });
  assert.equal(offers[0]?.itemPrice, 139);
  assert.equal(offers[0]?.shipping, 8);
  assert.equal(offers[0]?.seller, 'trusted');
});

void test('Cardmarket price guide parser streams fixture rows and validates host allowlist', async () => {
  const csv = 'idProduct,avg,trend,low\n123,10.5,11.2,8.0\n124,20,,18\n';
  const stream = new Blob([csv]).stream();
  const rows = [];
  for await (const row of parseCardmarketPriceGuide(stream)) rows.push(row);
  assert.deepEqual(rows, [
    { productId: '123', average: 10.5, trend: 11.2, low: 8 },
    { productId: '124', average: 20, trend: null, low: 18 },
  ]);
  assert.equal(
    validateOfficialCardmarketUrl(
      'https://downloads.s3.cardmarket.com/file.csv',
    ).hostname,
    'downloads.s3.cardmarket.com',
  );
  assert.throws(
    () => validateOfficialCardmarketUrl('http://127.0.0.1/file.csv'),
    /allowlisted/,
  );
});

void test('Marktplaats public connector parses public HTML without credentials', async () => {
  const html =
    '<li class="hz-Listing"><a href="/v/hobby/pokemon/m1234567890-test"><span class="ListingTitle_x">Pokemon ETB sealed</span><h5 class="ListingPrice_x">€ 49,00</h5><span data-testid="location-label">Heerlen</span></a></li>';
  let requests = 0;
  const connector = new MarktplaatsPublicConnector({
    fetchImpl: async () => {
      requests += 1;
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html', etag: 'fixture-v1' },
      });
    },
  });
  assert.deepEqual(await connector.validateConfig(), {
    valid: true,
    errors: [],
  });
  const records = await connector.scan({ query: 'pokemon etb', limit: 50 });
  assert.equal(requests, 1);
  assert.equal(records.length, 1);
  const offers = await connector.normalise(records[0]!);
  assert.equal(offers[0]?.sourceListingId, 'm1234567890');
  assert.equal(offers[0]?.itemPrice, 49);
  assert.equal(offers[0]?.location, 'Heerlen');
  assert.equal(connector.getPolicy().access, 'public_page');
  assert.equal(connector.getPolicy().checkoutAllowed, false);
});

void test('Marktplaats public connector stops immediately on 403 and 429', async () => {
  for (const status of [403, 429]) {
    let requests = 0;
    const connector = new MarktplaatsPublicConnector({
      fetchImpl: async () => {
        requests += 1;
        return new Response('blocked', { status });
      },
    });
    await assert.rejects(
      connector.scan({ query: 'pokemon', limit: 50 }),
      (error) => {
        assert.equal((error as { status?: number }).status, status);
        return true;
      },
    );
    assert.equal(requests, 1);
  }
});
