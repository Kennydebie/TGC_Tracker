import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCardmarketPriceGuide,
  validateOfficialCardmarketUrl,
} from '../../lib/connectors/cardmarket-public.ts';
import { EbayBrowseConnector } from '../../lib/connectors/ebay.ts';

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
