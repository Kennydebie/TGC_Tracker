import assert from 'node:assert/strict';
import test from 'node:test';

import { deals, releases } from '../lib/fixtures.ts';
import {
  completedSaleProfit,
  DEMO_COMPLETED_SALES,
  DEMO_PORTFOLIO_HOLDINGS,
  summarizeDemoPortfolio,
} from '../lib/portfolio.ts';
import {
  buildPortfolioCsv,
  calculateLotOffer,
  filterHistoryPoints,
  normalizeIdentity,
  searchDealsByIdentity,
  sortReleasesChronologically,
  validateAlertRule,
  validateUserSettings,
} from '../lib/workflow-integrity.ts';

void test('canonical market search never substitutes an unrelated record', () => {
  assert.deepEqual(
    searchDealsByIdentity(deals, 'Riftbound Spiritforged Booster Display'),
    [],
  );
  assert.equal(
    searchDealsByIdentity(deals, 'Prismatic Evolutions ETB')[0]?.id,
    deals[0]?.id,
  );
  assert.equal(
    searchDealsByIdentity(deals, 'anything', deals[1]?.id)[0]?.id,
    deals[1]?.id,
  );
});

void test('identity normalisation is accent and punctuation insensitive', () => {
  assert.equal(normalizeIdentity('Pokémon—TCG'), 'pokemon tcg');
});

void test('lot offer rejects negative and non-finite assumptions', () => {
  const baseline = {
    grossExit: 292,
    laborHours: 6.5,
    laborRate: 18,
    liquidityHaircut: 35,
    expectedLoss: 14,
    sellingCosts: 22,
    requiredProfit: 100,
  };
  const valid = calculateLotOffer(baseline);
  assert.equal(valid.valid, true);
  assert.equal(valid.maximumOffer, 4);
  for (const laborHours of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = calculateLotOffer({ ...baseline, laborHours });
    assert.equal(result.valid, false);
    assert.equal(result.maximumOffer, null);
  }
});

void test('alert and settings validation rejects values outside documented bounds', () => {
  assert.ok(
    validateAlertRule({
      matchConfidence: 101,
      minimumProfit: 25,
      minimumRoi: 0.2,
      minimumProfitPerHour: 20,
      maximumHoldingDays: 90,
      maximumRiskScore: 59,
    }).matchConfidence,
  );
  assert.ok(
    validateUserSettings({
      localRadiusKm: -5,
      laborRate: -10,
      requiredRoi: 0.2,
      requiredProfit: 25,
    }).localRadiusKm,
  );
});

void test('Amazon history ranges change the observed point set', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  const points = [
    { at: '2026-09-05T00:00:00Z', price: 1 },
    { at: '2026-08-30T12:00:00Z', price: 2 },
    { at: '2026-06-01T12:00:00Z', price: 3 },
    { at: 'invalid', price: 4 },
  ];
  assert.deepEqual(
    filterHistoryPoints(points, '24h', now).map((point) => point.price),
    [1],
  );
  assert.deepEqual(
    filterHistoryPoints(points, '7d', now).map((point) => point.price),
    [1, 2],
  );
  assert.deepEqual(
    filterHistoryPoints(points, '90d', now).map((point) => point.price),
    [1, 2],
  );
});

void test('release records sort chronologically without losing Pokémon identity', () => {
  const sorted = sortReleasesChronologically(releases);
  assert.deepEqual(
    sorted.map((release) => release.releaseDate),
    ['2026-09-11', '2026-09-18', '2026-10-09'],
  );
  assert.equal(
    releases.filter(
      (release) => normalizeIdentity(release.game) === 'pokemon',
    )[0]?.id,
    'pokemon-autumn-set',
  );
});

void test('portfolio summary and CSV reconcile to the same displayed rows', () => {
  const summary = summarizeDemoPortfolio();
  assert.deepEqual(summary, {
    cashInvested: 1749.2,
    conservativeLiquidationValue: 1765.6,
    patientSaleValue: 2097,
    unrealisedResult: 16.4,
    realisedProfit: 412.6,
    averageHoldingDays: 78,
    deadInventory: 384,
  });
  assert.equal(
    DEMO_COMPLETED_SALES.reduce(
      (total, sale) => total + completedSaleProfit(sale),
      0,
    ),
    412.6,
  );
  const csv = buildPortfolioCsv([
    ...DEMO_PORTFOLIO_HOLDINGS.slice(0, 1).map((holding) => ({
      product: `${holding.name}, "sealed"`,
      quantity: holding.qty,
      costBasis: holding.basis,
      cashOutNet: holding.liquidation,
      patientNet: holding.patient,
      status: holding.status,
      dataMode: 'demo' as const,
    })),
    {
      product: 'Saved demo lot',
      quantity: 1,
      costBasis: 10,
      cashOutNet: null,
      patientNet: null,
      status: 'Awaiting valuation evidence',
      dataMode: 'demo',
    },
  ]);
  assert.match(csv, /"Prismatic Evolutions ETB, ""sealed"""/);
  assert.match(
    csv,
    /Saved demo lot,1,10\.00,,,Awaiting valuation evidence,demo/,
  );
});
