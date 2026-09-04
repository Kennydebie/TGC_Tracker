import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AMAZON_MARKETPLACES,
  amazonOpportunityScore,
  amazonRiskScore,
  buildAmazonProductUrl,
  calculatePriceHistory,
  convertCurrency,
  deliveredPrice,
  detectProductLanguage,
  extractAmazonAsin,
  historicalPercentile,
  isAllowedAmazonProductUrl,
  marketplaceFromHostname,
  maximumAmazonPrices,
  offerFreshness,
  parseAmazonQuantity,
  priceDrop,
  sellerCountChange,
} from '../lib/amazon.ts';
import { KeepaTokenBudget } from '../lib/connectors/keepa.ts';

void test('extracts ASIN and marketplace from allowed Amazon product URLs', () => {
  assert.deepEqual(
    extractAmazonAsin('https://www.amazon.de/Pokemon/dp/B0DPKPRSM1?tag=x'),
    { asin: 'B0DPKPRSM1', marketplace: 'DE' },
  );
  assert.deepEqual(
    extractAmazonAsin('https://amazon.nl/gp/product/B0DPKPRSM1'),
    { asin: 'B0DPKPRSM1', marketplace: 'NL' },
  );
});

void test('rejects non-HTTPS, lookalike hosts and ASIN-free URLs', () => {
  assert.equal(extractAmazonAsin('http://amazon.de/dp/B0DPKPRSM1'), null);
  assert.equal(
    extractAmazonAsin('https://amazon.de.evil.test/dp/B0DPKPRSM1'),
    null,
  );
  assert.equal(extractAmazonAsin('https://www.amazon.de/s?k=pokemon'), null);
});

void test('maps marketplace hostnames and exposes honest Keepa coverage', () => {
  assert.equal(marketplaceFromHostname('amazon.com.be'), 'BE');
  assert.equal(marketplaceFromHostname('www.amazon.fr'), 'FR');
  assert.equal(AMAZON_MARKETPLACES.NL.keepaDomainId, null);
  assert.equal(AMAZON_MARKETPLACES.BE.keepaDomainId, null);
  assert.equal(AMAZON_MARKETPLACES.DE.keepaDomainId, 3);
});

void test('builds only canonical allowlisted Amazon product URLs', () => {
  const url = buildAmazonProductUrl('B0DPKPRSM1', 'FR');
  assert.equal(url, 'https://www.amazon.fr/dp/B0DPKPRSM1');
  assert.equal(isAllowedAmazonProductUrl(url), true);
  assert.throws(() => buildAmazonProductUrl('bad', 'DE'));
});

void test('normalises booster, display, case and ETB quantities', () => {
  assert.deepEqual(
    parseAmazonQuantity('Booster box 36 booster packs').canonicalUnit,
    'box',
  );
  assert.equal(
    parseAmazonQuantity('Booster box 36 booster packs').packCount,
    36,
  );
  assert.equal(parseAmazonQuantity('Booster box 36 booster packs').units, 1);
  assert.equal(parseAmazonQuantity('Case of 6 displays').caseCount, 6);
  assert.equal(
    parseAmazonQuantity('Pokémon Elite Trainer Box').canonicalUnit,
    'etb',
  );
  assert.equal(parseAmazonQuantity('Mystery assortment').ambiguous, true);
});

void test('detects product language only from explicit language evidence', () => {
  assert.equal(detectProductLanguage('Pokémon TCG English edition'), 'English');
  assert.equal(detectProductLanguage('Deutsche Ausgabe Booster Box'), 'German');
  assert.equal(
    detectProductLanguage('Booster Box sold on Amazon DE'),
    'Unknown',
  );
});

void test('delivered price requires known or estimated shipping', () => {
  assert.equal(
    deliveredPrice({
      itemPrice: 54.99,
      shipping: 5.99,
      shippingStatus: 'ESTIMATED',
    }),
    60.98,
  );
  assert.equal(
    deliveredPrice({
      itemPrice: 54.99,
      shipping: null,
      shippingStatus: 'UNKNOWN',
    }),
    null,
  );
});

void test('FX conversion includes explicit FX cost', () => {
  assert.equal(convertCurrency(100, 0.9, 0.02), 91.8);
});

void test('calculates historical percentile and rolling price history', () => {
  assert.equal(historicalPercentile(55, [54, 60, 70, 80]), 25);
  const now = Date.UTC(2026, 8, 4);
  const history = calculatePriceHistory(
    55,
    [
      { at: new Date(now - 2 * 86_400_000).toISOString(), price: 60 },
      { at: new Date(now - 20 * 86_400_000).toISOString(), price: 70 },
      { at: new Date(now - 100 * 86_400_000).toISOString(), price: 80 },
    ],
    now,
  );
  assert.equal(history.low30d, 60);
  assert.equal(history.median30d, 65);
  assert.equal(history.low180d, 60);
  assert.equal(history.historicalPercentile, 0);
});

void test('calculates price drops and ignores price increases', () => {
  assert.deepEqual(priceDrop(74.95, 54.99), {
    amount: 19.96,
    percentage: (74.95 - 54.99) / 74.95,
  });
  assert.equal(priceDrop(50, 60), null);
});

void test('calculates maximum Amazon item and delivered prices separately', () => {
  assert.deepEqual(
    maximumAmazonPrices({
      conservativeNetExit: 94,
      nonItemAcquisitionCosts: 5.99,
      requiredProfit: 25,
    }),
    { maximumAmazonDeliveredPrice: 69, maximumAmazonItemPrice: 63.01 },
  );
});

void test('seller count history produces signed changes', () => {
  assert.equal(sellerCountChange(21, 8), -13);
  assert.equal(sellerCountChange(6, 29), 23);
  assert.equal(sellerCountChange(null, 8), null);
});

void test('Amazon Opportunity Score rewards quality and penalises ambiguity', () => {
  const base = {
    discountToExit: 0.35,
    historicalPercentile: 4,
    profit: 33,
    roi: 0.5,
    sellerType: 'AMAZON_DIRECT' as const,
    liquidity: 'High' as const,
    priceDropMagnitude: 0.26,
    sellerCountTrend: -4,
    dataConfidence: 97,
    shippingStatus: 'ESTIMATED' as const,
    freshness: 'Fresh' as const,
  };
  const clean = amazonOpportunityScore({ ...base, riskFlags: [] });
  const ambiguous = amazonOpportunityScore({
    ...base,
    riskFlags: ['quantity_ambiguous', 'weak_exit_evidence'],
  });
  assert.ok(clean > ambiguous);
  assert.ok(clean <= 100 && ambiguous >= 0);
});

void test('unknown shipping and stale offers increase Amazon risk', () => {
  const known = amazonRiskScore({
    riskFlags: [],
    shippingStatus: 'ESTIMATED',
    sellerType: 'FBA',
    freshness: 'Fresh',
    matchConfidence: 96,
  });
  const unknown = amazonRiskScore({
    riskFlags: [],
    shippingStatus: 'UNKNOWN',
    sellerType: 'UNKNOWN',
    freshness: 'Stale',
    matchConfidence: 96,
  });
  assert.ok(unknown > known);
});

void test('freshness labels use explicit age bands', () => {
  const now = Date.UTC(2026, 8, 4, 12);
  assert.equal(
    offerFreshness(new Date(now - 4 * 60_000).toISOString(), now).label,
    'Fresh',
  );
  assert.equal(
    offerFreshness(new Date(now - 40 * 60_000).toISOString(), now).label,
    'Recent',
  );
  assert.equal(
    offerFreshness(new Date(now - 90 * 60_000).toISOString(), now).label,
    'Stale',
  );
  assert.equal(offerFreshness(null, now).label, 'Unknown');
});

void test('token budget preserves reserve and prioritises watched products', () => {
  const budget = new KeepaTokenBudget(() => 1_000);
  budget.update({
    tokensLeft: 7,
    tokensConsumed: 2,
    refillRate: 5,
    refillIn: 60_000,
  });
  assert.equal(budget.canSpend(3, 'discovery'), false);
  assert.equal(budget.canSpend(7, 'critical_watched'), true);
  assert.deepEqual(
    budget
      .sort([
        { id: 'broad', priority: 'discovery' },
        { id: 'watch', priority: 'critical_watched' },
      ])
      .map((item) => item.id),
    ['watch', 'broad'],
  );
  assert.equal(budget.snapshot().tokensUsed, 2);
  assert.equal(budget.snapshot().skippedRequests, 1);
});
