import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allInCostWithinMaximum,
  calculateEconomics,
  confidenceGrade,
  itemPriceWithinMaximum,
} from '../lib/domain.ts';
import { validateSourceListingUrl } from '../lib/listing-url.ts';
import {
  detectMisleadingTitle,
  normaliseLanguage,
  parseQuantity,
} from '../lib/normalisation.ts';
import {
  alertDedupeKey,
  calculateInstantScore,
  cooldownExpired,
} from '../lib/services/scoring.ts';

const baseInput = {
  itemPrice: 100,
  inboundShipping: 7,
  buyerFees: 2,
  paymentFees: 1,
  importCosts: 0,
  travelCost: 0,
  acquisitionLabor: 0,
  expectedSalePrice: 170,
  sellerFees: 17,
  exitPaymentFees: 2,
  outboundShipping: 7,
  packaging: 2,
  expectedReturnLoss: 3,
  sellingLabor: 4,
  liquidityHaircut: 5,
  estimatedHours: 1.5,
  expectedHoldingDays: 30,
  requiredProfit: 25,
};

void test('calculates all-in cost, conservative net exit, profit and maximum item price', () => {
  const result = calculateEconomics(baseInput);
  assert.equal(result.allInCost, 110);
  assert.equal(result.conservativeNetExit, 130);
  assert.equal(result.conservativeProfit, 20);
  assert.equal(result.maximumItemPrice, 95);
  assert.equal(result.maximumAllInCost, 105);
  assert.equal(result.nonItemAcquisitionCosts, 10);
  assert.equal(result.profitPerHour, 13.33);
  assert.equal(Math.round(result.roi * 10_000), 1818);
});

void test('uses the item and all-in maximums against their matching cost basis', () => {
  const result = calculateEconomics({
    ...baseInput,
    itemPrice: 118,
    inboundShipping: 6.95,
    buyerFees: 1.5,
    paymentFees: 0,
    expectedSalePrice: 195,
    sellerFees: 19,
    exitPaymentFees: 2.5,
    outboundShipping: 7.25,
    packaging: 1.8,
    expectedReturnLoss: 3.5,
    sellingLabor: 4,
    liquidityHaircut: 2,
    estimatedHours: 1.1,
    expectedHoldingDays: 18,
  });
  assert.equal(result.itemPrice, 118);
  assert.equal(result.nonItemAcquisitionCosts, 8.45);
  assert.equal(result.allInCost, 126.45);
  assert.equal(result.conservativeNetExit, 154.95);
  assert.equal(result.requiredProfit, 25);
  assert.equal(result.maximumItemPrice, 121.5);
  assert.equal(result.maximumAllInCost, 129.95);
  assert.equal(result.conservativeProfit, 28.5);
  assert.equal(Math.round(result.roi * 10_000), 2254);
  assert.equal(itemPriceWithinMaximum(result), true);
  assert.equal(allInCostWithinMaximum(result), true);
});

void test('validates original listing URLs against source-specific allowlists', () => {
  assert.equal(
    validateSourceListingUrl('ebay', 'https://www.ebay.nl/itm/123').hostname,
    'www.ebay.nl',
  );
  assert.throws(
    () => validateSourceListingUrl('ebay', 'https://example.com/itm/123'),
    /allowlisted/,
  );
  assert.throws(
    () => validateSourceListingUrl('ebay', 'http://www.ebay.nl/itm/123'),
    /HTTPS/,
  );
});

void test('preserves a negative fee-trap outcome instead of presenting a headline discount', () => {
  const result = calculateEconomics({
    ...baseInput,
    itemPrice: 139,
    expectedSalePrice: 169,
    inboundShipping: 8,
    paymentFees: 2,
    sellerFees: 12,
    exitPaymentFees: 0,
    outboundShipping: 6,
    packaging: 2,
    expectedReturnLoss: 3,
    sellingLabor: 2,
    liquidityHaircut: 0,
  });
  assert.equal(result.allInCost, 151);
  assert.equal(result.conservativeNetExit, 144);
  assert.equal(result.conservativeProfit, -7);
  assert.ok(result.roi < 0);
});

void test('normalises multilingual language aliases', () => {
  assert.equal(normaliseLanguage('Engels'), 'English');
  assert.equal(normaliseLanguage('Deutsch'), 'German');
  assert.equal(normaliseLanguage('Frans'), 'French');
});

void test('parses explicit quantities and withholds ambiguous quantity', () => {
  assert.deepEqual(parseQuantity('2x Prismatic Evolutions ETB'), {
    quantity: 2,
    confidence: 0.95,
    reason: 'quantity prefix',
  });
  assert.equal(parseQuantity('Riftbound display maybe case').quantity, null);
});

void test('detects misleading empty-box wording in multiple languages', () => {
  assert.ok(
    detectMisleadingTitle('Pokemon 151 box ONLY leeg - lees!').includes(
      'empty_packaging',
    ),
  );
  assert.ok(
    detectMisleadingTitle('Pokemon 151 box ONLY leeg - lees!').includes(
      'description_qualifier',
    ),
  );
});

void test('caps weak-confidence deal scores', () => {
  const factors = {
    discount: 100,
    margin: 100,
    liquidity: 100,
    seller: 100,
    dataConfidence: 100,
    freshness: 100,
    crossMarket: 100,
    riskPenalty: 0,
  } as const;
  assert.equal(calculateInstantScore({ ...factors, confidenceGrade: 'D' }), 49);
  assert.equal(calculateInstantScore({ ...factors, confidenceGrade: 'C' }), 74);
  assert.equal(
    calculateInstantScore({ ...factors, confidenceGrade: 'A' }),
    100,
  );
});

void test('grades evidence and applies cooldown boundaries', () => {
  assert.equal(confidenceGrade(94, 3), 'A');
  assert.equal(confidenceGrade(88, 2), 'B');
  assert.equal(confidenceGrade(55, 4), 'D');
  assert.equal(cooldownExpired(1_000, 60, 3_600_999), false);
  assert.equal(cooldownExpired(1_000, 60, 3_601_000), true);
  assert.equal(
    alertDedupeKey('u1', 'l1', 'price_drop', 12_349),
    'u1:l1:price_drop:123',
  );
});
