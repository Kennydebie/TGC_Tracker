import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScoutResearchFinding } from '../lib/community.ts';
import { buildScoutRoadmap } from '../lib/scout-roadmap.ts';

const now = Date.parse('2026-09-06T12:00:00.000Z');

function finding(
  overrides: Partial<ScoutResearchFinding> = {},
): ScoutResearchFinding {
  return {
    id: 'finding-1',
    sourceKind: 'official',
    sourceIdentifier: 'official:riftbound',
    game: 'riftbound',
    headline: 'Riftbound registration window',
    productName: 'Riftbound T1 set',
    productLanguage: 'English',
    updateType: 'release',
    summary: 'Registration details were published.',
    sourceUrl: 'https://example.com/news',
    subreddit: null,
    sourceExternalId: null,
    retailerName: null,
    retailerOrOfficialUrl: 'https://example.com/register',
    publishedAt: '2026-07-01T10:00:00.000Z',
    observedAt: '2026-09-06T11:00:00.000Z',
    materialChangedAt: '2026-09-06T11:00:00.000Z',
    eventAt: '2026-10-01T10:00:00.000Z',
    actionOpensAt: '2026-07-15T10:00:00.000Z',
    actionDeadlineAt: '2026-09-06T20:00:00.000Z',
    actionType: 'register',
    actionInstruction: 'Register through the official event page.',
    actionUrl: 'https://example.com/register',
    lifecycleStatus: 'registration_open',
    price: null,
    currency: null,
    region: 'EU',
    shippingToNetherlands: 'unknown',
    availability: 'unknown',
    verificationStatus: 'official_checked',
    verificationEvidenceUrl: 'https://example.com/register',
    verificationObservedAt: '2026-09-06T11:00:00.000Z',
    collectionMethod: 'chatgpt_web_research',
    ...overrides,
  };
}

void test('empty roadmap still renders July through December with empty months', () => {
  const roadmap = buildScoutRoadmap([], now);
  assert.equal(roadmap.startMonthKey, '2026-07');
  assert.equal(roadmap.endMonthKey, '2026-12');
  assert.equal(roadmap.months.length, 6);
  assert.equal(roadmap.totalMilestones, 0);
  assert.ok(roadmap.months.every((month) => month.milestones.length === 0));
  assert.equal(
    roadmap.months.find((month) => month.key === '2026-09')?.isCurrent,
    true,
  );
});

void test('January keeps the most recent July and includes the current month', () => {
  const january = Date.parse('2027-01-12T12:00:00.000Z');
  const roadmap = buildScoutRoadmap([], january);
  assert.equal(roadmap.startMonthKey, '2026-07');
  assert.equal(roadmap.endMonthKey, '2027-01');
  assert.equal(roadmap.months.length, 7);
  assert.equal(
    roadmap.months.find((month) => month.key === '2027-01')?.isCurrent,
    true,
  );
});

void test('one finding emits opening, deadline and event milestones', () => {
  const roadmap = buildScoutRoadmap([finding()], now);
  assert.deepEqual(
    roadmap.months.flatMap((month) =>
      month.milestones.map((milestone) => [milestone.kind, milestone.monthKey]),
    ),
    [
      ['opens', '2026-07'],
      ['deadline', '2026-09'],
      ['event', '2026-10'],
    ],
  );
});

void test('date-only milestones preserve unknown time precision', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: '2026-11-14',
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'announced',
      }),
    ],
    now,
  );
  const milestone = roadmap.months.flatMap((month) => month.milestones).at(0);
  assert.equal(milestone?.precision, 'date');
  assert.equal(milestone?.instant, null);
  assert.equal(milestone?.dateKey, '2026-11-14');
});

void test('exact instants group by the Amsterdam calendar month', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: '2026-09-30T22:30:00.000Z',
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'announced',
      }),
    ],
    now,
  );
  assert.equal(
    roadmap.months.flatMap((month) => month.milestones).at(0)?.monthKey,
    '2026-10',
  );
});

void test('latest future source extends the roadmap across years and keeps empty months', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: '2027-03-09',
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'announced',
      }),
    ],
    now,
  );
  assert.equal(roadmap.endMonthKey, '2027-03');
  assert.deepEqual(
    roadmap.months.map((month) => month.key),
    [
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ],
  );
});

void test('closed signup history is faded independently from its future event', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        lifecycleStatus: 'closed',
        actionDeadlineAt: '2026-08-31',
        eventAt: '2026-10-12',
      }),
    ],
    now,
  );
  const milestones = roadmap.months.flatMap((month) => month.milestones);
  assert.equal(
    milestones.find((milestone) => milestone.kind === 'deadline')
      ?.temporalState,
    'closed',
  );
  assert.equal(
    milestones.find((milestone) => milestone.kind === 'deadline')?.attention,
    'expired',
  );
  assert.equal(
    milestones.find((milestone) => milestone.kind === 'event')?.temporalState,
    'future',
  );
  assert.notEqual(
    milestones.find((milestone) => milestone.kind === 'event')?.attention,
    'expired',
  );
});

void test('cancelled far-future entries do not extend the roadmap', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: '2027-08-01',
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'cancelled',
      }),
    ],
    now,
  );
  assert.equal(roadmap.endMonthKey, '2026-12');
  assert.equal(roadmap.totalMilestones, 0);
});

void test('secondary future events never inherit an urgent deadline style', () => {
  const roadmap = buildScoutRoadmap([finding()], now);
  const milestones = roadmap.months.flatMap((month) => month.milestones);
  assert.equal(
    milestones.find((milestone) => milestone.kind === 'deadline')?.attention,
    'critical',
  );
  assert.equal(
    milestones.find((milestone) => milestone.kind === 'event')?.attention,
    'info',
  );
});

void test('invalid and pre-July milestones are ignored defensively', () => {
  const roadmap = buildScoutRoadmap(
    [
      finding({
        id: 'invalid',
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: 'not-a-date',
      }),
      finding({
        id: 'before-range',
        actionOpensAt: null,
        actionDeadlineAt: null,
        eventAt: '2026-06-30',
      }),
    ],
    now,
  );
  assert.equal(roadmap.totalMilestones, 0);
});
