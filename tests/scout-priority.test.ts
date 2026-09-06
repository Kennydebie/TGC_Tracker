import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScoutResearchFinding } from '../lib/community.ts';
import {
  assessScoutFinding,
  buildScoutActionTimeline,
  checkedScoutActionUrl,
  rankScoutFindings,
} from '../lib/scout-priority.ts';

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
    publishedAt: '2026-09-06T10:00:00.000Z',
    observedAt: '2026-09-06T11:00:00.000Z',
    materialChangedAt: '2026-09-06T11:00:00.000Z',
    eventAt: '2026-10-01T10:00:00.000Z',
    actionOpensAt: '2026-09-01T10:00:00.000Z',
    actionDeadlineAt: '2026-09-06T20:00:00.000Z',
    actionType: 'register',
    actionInstruction: 'Register through the official event page.',
    actionUrl: 'https://example.com/register',
    lifecycleStatus: 'registration_open',
    price: 350,
    currency: 'EUR',
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

void test('verified deadlines become critical while community reports are capped at watch', () => {
  assert.equal(assessScoutFinding(finding(), now).level, 'critical');
  assert.equal(
    assessScoutFinding(
      finding({
        verificationStatus: 'community_report',
        verificationEvidenceUrl: null,
        verificationObservedAt: null,
      }),
      now,
    ).level,
    'watch',
  );
});

void test('closed, past-deadline and unavailable findings are demoted without losing a future event', () => {
  assert.equal(
    assessScoutFinding(
      finding({ lifecycleStatus: 'closed', eventAt: null }),
      now,
    ).level,
    'expired',
  );
  assert.equal(
    assessScoutFinding(
      finding({
        actionDeadlineAt: '2026-09-06T11:00:00.000Z',
        eventAt: null,
      }),
      now,
    ).level,
    'expired',
  );
  const closedActionWithFutureEvent = assessScoutFinding(
    finding({ lifecycleStatus: 'closed' }),
    now,
  );
  assert.equal(closedActionWithFutureEvent.level, 'watch');
  assert.equal(closedActionWithFutureEvent.nextRelevantKind, 'event');
  assert.equal(
    assessScoutFinding(finding({ shippingToNetherlands: 'unavailable' }), now)
      .level,
    'info',
  );
});

void test('future opening windows never say act now before they open', () => {
  const assessment = assessScoutFinding(
    finding({
      actionOpensAt: '2026-09-06T18:00:00.000Z',
      actionDeadlineAt: '2026-09-06T20:00:00.000Z',
    }),
    now,
  );
  assert.equal(assessment.level, 'high');
  assert.equal(assessment.label, 'Opens soon');
  assert.equal(assessment.actionState, 'upcoming');
  assert.equal(assessment.nextRelevantKind, 'opens');
});

void test('date-only openings require an explicit open lifecycle before exposing an action', () => {
  const announced = finding({
    actionOpensAt: '2026-09-06',
    lifecycleStatus: 'announced',
  });
  const announcedAssessment = assessScoutFinding(announced, now);
  assert.equal(announcedAssessment.actionState, 'upcoming');
  assert.notEqual(announcedAssessment.label, 'Act now');
  assert.equal(checkedScoutActionUrl(announced, announcedAssessment), null);

  const confirmedOpen = finding({ actionOpensAt: '2026-09-06' });
  const confirmedAssessment = assessScoutFinding(confirmedOpen, now);
  assert.equal(confirmedAssessment.actionState, 'open');
  assert.equal(
    checkedScoutActionUrl(confirmedOpen, confirmedAssessment),
    'https://example.com/register',
  );

  const tomorrow = finding({
    actionOpensAt: '2026-09-07',
    lifecycleStatus: 'announced',
  });
  const tomorrowAssessment = assessScoutFinding(tomorrow, now);
  assert.equal(tomorrowAssessment.actionState, 'upcoming');
  assert.equal(tomorrowAssessment.label, 'Check opening date');
  assert.notEqual(tomorrowAssessment.label, 'Check opening today');
});

void test('stale verification cannot become a high or critical alert', () => {
  const assessment = assessScoutFinding(
    finding({ verificationObservedAt: '2026-09-01T11:00:00.000Z' }),
    now,
  );
  assert.equal(assessment.level, 'watch');
  assert.equal(assessment.label, 'Reverify now');
  assert.equal(assessment.verificationCurrent, false);
});

void test('announced and non-window actions cannot manufacture urgency', () => {
  const announced = assessScoutFinding(
    finding({ actionOpensAt: null, lifecycleStatus: 'announced' }),
    now,
  );
  assert.equal(announced.level, 'watch');
  assert.equal(announced.label, 'Opening unconfirmed');
  assert.equal(announced.actionState, 'unknown');

  for (const actionType of ['watch', 'verify'] as const) {
    const assessment = assessScoutFinding(finding({ actionType }), now);
    assert.equal(assessment.level, 'watch');
    assert.notEqual(assessment.label, 'Act now');
  }
});

void test('date-only deadlines are useful without inventing an exact critical time', () => {
  const assessment = assessScoutFinding(
    finding({ actionDeadlineAt: '2026-09-06' }),
    now,
  );
  assert.equal(assessment.level, 'high');
  assert.notEqual(assessment.label, 'Act now');
});

void test('past events expire while stale undated community chatter stays informational', () => {
  const noAction = {
    actionOpensAt: null,
    actionDeadlineAt: null,
    actionType: null,
    actionInstruction: null,
    actionUrl: null,
  } satisfies Partial<ScoutResearchFinding>;
  assert.equal(
    assessScoutFinding(
      finding({
        ...noAction,
        eventAt: '2026-09-05',
        lifecycleStatus: 'announced',
      }),
      now,
    ).level,
    'expired',
  );
  const chatter = assessScoutFinding(
    finding({
      ...noAction,
      eventAt: null,
      updateType: 'market_update',
      verificationStatus: 'community_report',
      verificationEvidenceUrl: null,
      verificationObservedAt: null,
      observedAt: '2026-08-01T12:00:00.000Z',
      materialChangedAt: '2026-08-01T12:00:00.000Z',
    }),
    now,
  );
  assert.equal(chatter.level, 'info');
  assert.equal(chatter.freshness, 'stale');
});

void test('purchase-like actions require economics and can never become buy alerts', () => {
  for (const actionType of ['buy', 'preorder'] as const) {
    const assessment = assessScoutFinding(
      finding({ actionType, actionInstruction: 'Buy before the deadline.' }),
      now,
    );
    assert.equal(assessment.level, 'watch');
    assert.equal(assessment.label, 'Verify economics');
    assert.equal(assessment.requiresEconomics, true);
  }
});

void test('action links require current checked evidence on the same host', () => {
  const verified = finding();
  const verifiedAssessment = assessScoutFinding(verified, now);
  assert.equal(
    checkedScoutActionUrl(verified, verifiedAssessment),
    'https://example.com/register',
  );

  const community = finding({
    verificationStatus: 'community_report',
    verificationEvidenceUrl: null,
    verificationObservedAt: null,
  });
  assert.equal(
    checkedScoutActionUrl(community, assessScoutFinding(community, now)),
    null,
  );

  const mismatched = finding({
    actionUrl: 'https://unrelated.example/register',
  });
  assert.equal(
    checkedScoutActionUrl(mismatched, assessScoutFinding(mismatched, now)),
    null,
  );
});

void test('priority ignores hype and monetary claims in free-text summaries', () => {
  const ordinary = assessScoutFinding(
    finding({ summary: 'Registration details were published.' }),
    now,
  );
  const hype = assessScoutFinding(
    finding({
      summary: 'Guaranteed €2,000 profit. Buy immediately. Cannot lose.',
    }),
    now,
  );
  assert.deepEqual(hype, ordinary);
  assert.equal(hype.economicsStatus, 'not_underwritten');
});

void test('timeline is chronological while the activity feed is importance sorted', () => {
  const laterCritical = finding({
    id: 'critical',
    actionDeadlineAt: '2026-09-06T20:00:00.000Z',
  });
  const earlierWatch = finding({
    id: 'watch',
    verificationStatus: 'community_report',
    verificationEvidenceUrl: null,
    verificationObservedAt: null,
    actionDeadlineAt: '2026-09-06T18:00:00.000Z',
  });

  assert.deepEqual(
    rankScoutFindings([earlierWatch, laterCritical], now).map(
      (item) => item.finding.id,
    ),
    ['critical', 'watch'],
  );
  assert.deepEqual(
    buildScoutActionTimeline([laterCritical, earlierWatch], now).map(
      (item) => item.finding.id,
    ),
    ['watch', 'critical'],
  );
});
