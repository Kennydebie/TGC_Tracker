import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assessMarktplaatsTitle,
  buildMarktplaatsSearchUrl,
  calculatePickupCost,
  deduplicateMarktplaatsListings,
  detectMarktplaatsBlock,
  extractMarktplaatsListingId,
  isAllowedMarktplaatsListingUrl,
  listingAvailabilityAfterMisses,
  marktplaatsScanIntervalMinutes,
  parseMarktplaatsSearchHtml,
  parseMarktplaatsStructuredData,
  priceChange,
} from '../lib/marktplaats.ts';

const fixture = (name: string) =>
  readFile(
    new URL(`./fixtures/marktplaats/${name}.html`, import.meta.url),
    'utf8',
  );

void test('builds public search URLs and enforces the 15-minute floor', () => {
  const url = buildMarktplaatsSearchUrl({
    query: 'pokemon kaarten',
    minimumPrice: 10,
    maximumPrice: 150,
    postcode: '6411AA',
    distanceKm: 100,
  });
  assert.equal(url.hostname, 'www.marktplaats.nl');
  assert.match(url.pathname, /pokemon%2Bkaarten/);
  assert.equal(url.searchParams.get('PriceCentsFrom'), '1000');
  assert.equal(url.searchParams.get('PriceCentsTo'), '15000');
  assert.equal(url.searchParams.get('distanceMeters'), '100000');
  assert.equal(marktplaatsScanIntervalMinutes(1), 15);
  assert.equal(marktplaatsScanIntervalMinutes(30), 30);
});

void test('extracts IDs and only allows official Marktplaats listing URLs', () => {
  assert.equal(
    extractMarktplaatsListingId('/v/hobby/pokemon/m1234567890-example'),
    'm1234567890',
  );
  assert.equal(
    isAllowedMarktplaatsListingUrl(
      'https://www.marktplaats.nl/v/hobby/pokemon/m1234567890-example',
    ),
    true,
  );
  assert.equal(
    isAllowedMarktplaatsListingUrl(
      'https://evil.example/v/hobby/pokemon/m1234567890-example',
    ),
    false,
  );
});

void test('parses normal, multiple, missing and sponsored result fixtures', async () => {
  const normal = parseMarktplaatsSearchHtml(
    await fixture('normal'),
    'pokemon prismatic evolutions etb',
  );
  assert.equal(normal.length, 1);
  assert.equal(normal[0]?.price, 49);
  assert.equal(normal[0]?.location, 'Heerlen');
  assert.equal(normal[0]?.seller, 'ScoutSeller');
  assert.equal(normal[0]?.delivery, 'Ophalen of Verzenden');
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('multiple'), 'pokemon').length,
    2,
  );
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('price-missing'), 'pokemon')[0]
      ?.price,
    null,
  );
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('location-missing'), 'pokemon')[0]
      ?.location,
    null,
  );
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('sponsored'), 'pokemon')[0]
      ?.sponsored,
    true,
  );
});

void test('parses embedded structured listing data before semantic fallback', async () => {
  const listings = parseMarktplaatsStructuredData(
    await fixture('structured-data'),
    'pokemon 151 booster bundle',
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.sourceListingId, 'm1234567999');
  assert.equal(listings[0]?.price, 49.95);
  assert.equal(listings[0]?.location, 'Maastricht');
  assert.equal(listings[0]?.seller, 'Publieke verkoper');
});

void test('recognises parser changes, empty pages and challenges', async () => {
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('changed-markup'), 'pokemon')
      .length,
    0,
  );
  assert.equal(
    parseMarktplaatsSearchHtml(await fixture('empty'), 'pokemon').length,
    0,
  );
  assert.throws(() =>
    parseMarktplaatsSearchHtml(
      '<div class="g-recaptcha">challenge</div>',
      'pokemon',
    ),
  );
  assert.equal(
    detectMarktplaatsBlock(200, await fixture('challenge'))?.code,
    'captcha',
  );
  assert.equal(detectMarktplaatsBlock(403, '')?.code, 'http_403');
  assert.equal(detectMarktplaatsBlock(429, '')?.code, 'http_429');
});

void test('normalises Dutch and English aliases and routes dangerous asks to review', () => {
  assert.equal(
    assessMarktplaatsTitle('Pokemon boosterdoos ongeopend').productType,
    'Booster Box / Display',
  );
  assert.equal(
    assessMarktplaatsTitle('Riftbound booster box sealed').sealedStatus,
    'sealed',
  );
  const empty = assessMarktplaatsTitle('Pokemon ETB leeg alleen doos');
  assert.equal(empty.riskFlags.includes('empty_packaging'), true);
  assert.equal(empty.reviewRequired, true);
  assert.equal(
    assessMarktplaatsTitle('Gezocht pokemon kaarten ruilen').riskFlags.includes(
      'not_a_sale',
    ),
    true,
  );
  assert.equal(assessMarktplaatsTitle('12x Pokemon boosters').quantity, 12);
});

void test('deduplicates across queries and preserves every discovery query', () => {
  const base = {
    sourceListingId: 'm1234567890',
    sourceListingUrl:
      'https://www.marktplaats.nl/v/hobby/pokemon/m1234567890-example',
    title: 'Pokemon map',
    price: 25,
    location: 'Heerlen',
    seller: null,
    snippet: null,
    thumbnailUrl: null,
    listingTimestampText: 'Vandaag',
    delivery: 'Ophalen',
    sponsored: false,
  };
  const result = deduplicateMarktplaatsListings([
    { ...base, foundByQueries: ['pokemon map'] },
    { ...base, foundByQueries: ['oude pokemon kaarten'] },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.foundByQueries, [
    'pokemon map',
    'oude pokemon kaarten',
  ]);
});

void test('tracks price changes and conservative disappearance states', () => {
  assert.deepEqual(priceChange(155, 129), {
    kind: 'price_decrease',
    from: 155,
    to: 129,
    percentage: -26 / 155,
  });
  assert.equal(listingAvailabilityAfterMisses(1), 'possibly_unavailable');
  assert.equal(listingAvailabilityAfterMisses(2), 'possibly_unavailable');
  assert.equal(listingAvailabilityAfterMisses(3), 'unavailable');
});

void test('pickup cost includes distance, fuel, parking, tolls and time', () => {
  const cost = calculatePickupCost({
    oneWayDistanceKm: 18,
    fuelCostPerKm: 0.23,
    parking: 2,
    tolls: 0,
    averageSpeedKmH: 60,
    timeValuePerHour: 20,
  });
  assert.equal(cost.roundTripDistanceKm, 36);
  assert.equal(cost.fuelCost, 8.28);
  assert.equal(cost.travelTimeCost, 12);
  assert.equal(cost.total, 22.28);
});
