import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeScoutUrl,
  deriveScoutRunStatus,
  hashScoutValue,
  sanitizeScoutSourceCheck,
  sanitizeScoutFinding,
  ScoutIngestionValidationError,
  scoutFindingIdentity,
  validateScoutImportInput,
  type SaveScoutFindingsInput,
} from '../lib/scout-ingestion.ts';

function input(): SaveScoutFindingsInput {
  return {
    run: {
      id: 'community-scout:2026-09-05T20:00:00Z',
      startedAt: '2026-09-05T20:00:00Z',
      finishedAt: '2026-09-05T20:03:00Z',
      sourceChecks: [
        {
          sourceIdentifier: 'reddit:r/PokemonTCGNL',
          status: 'checked',
          checkedAt: '2026-09-05T20:02:00Z',
          coverageThrough: '2026-09-05T20:02:00Z',
          errorCode: null,
          detail: null,
        },
      ],
    },
    findings: [
      {
        sourceKind: 'reddit_comment',
        sourceIdentifier: 'reddit:r/PokemonTCGNL',
        game: 'pokemon',
        headline: null,
        productName: null,
        productLanguage: null,
        updateType: 'restock',
        summary: 'Community member reported a restock; price was not stated.',
        sourceUrl:
          'https://www.reddit.com/r/PokemonTCGNL/comments/test/?utm_source=x',
        subreddit: 'PokemonTCGNL',
        sourcePostOrCommentId: 'comment:test',
        retailerName: null,
        retailerOrOfficialUrl: null,
        publishedAt: null,
        observedAt: '2026-09-05T20:02:00Z',
        eventAt: null,
        actionOpensAt: null,
        actionDeadlineAt: null,
        actionType: null,
        actionInstruction: null,
        actionUrl: null,
        lifecycleStatus: 'unknown',
        price: null,
        currency: null,
        region: null,
        shippingToNetherlands: 'unknown',
        availability: 'unknown',
        verificationStatus: 'community_report',
        verificationEvidence: null,
        collectionMethod: 'chatgpt_web_research',
      },
    ],
  };
}

function validationIssues(
  value: SaveScoutFindingsInput,
  now: number,
): Array<{ code: string; path: string }> {
  try {
    validateScoutImportInput(value, now);
    assert.fail('Expected scout ingestion validation to fail.');
  } catch (error) {
    assert.ok(error instanceof ScoutIngestionValidationError);
    return error.issues;
  }
}

void test('validation preserves explicitly unknown facts and defaults the collection method', () => {
  const raw = input();
  delete (raw.findings[0] as Partial<(typeof raw.findings)[number]>)
    .collectionMethod;
  const parsed = validateScoutImportInput(raw);
  assert.equal(parsed.findings[0].productName, null);
  assert.equal(parsed.findings[0].price, null);
  assert.equal(parsed.findings[0].currency, null);
  assert.equal(parsed.findings[0].shippingToNetherlands, 'unknown');
  assert.equal(parsed.findings[0].availability, 'unknown');
  assert.equal(parsed.findings[0].collectionMethod, 'chatgpt_web_research');
});

void test('validation rejects malformed provenance, timestamps, URLs, and checked claims without evidence', () => {
  const malformed = input() as unknown as Record<string, unknown>;
  const findings = malformed.findings as Array<Record<string, unknown>>;
  findings[0] = {
    ...findings[0],
    sourceUrl: 'http://127.0.0.1/private',
    publishedAt: 'not-a-timestamp',
    price: 99,
    currency: null,
    verificationStatus: 'retailer_checked',
    verificationEvidence: null,
  };
  assert.throws(
    () => validateScoutImportInput(malformed),
    (error: Error & { issues?: Array<{ path: string }> }) => {
      const paths = new Set(error.issues?.map((issue) => issue.path));
      assert.ok(paths.has('findings.0.sourceUrl'));
      assert.ok(paths.has('findings.0.publishedAt'));
      assert.ok(paths.has('findings.0.currency'));
      assert.ok(paths.has('findings.0.verificationEvidence'));
      return true;
    },
  );
});

void test('validation bounds batches and requires unique source checks with ordered run timestamps', () => {
  const oversized = input();
  oversized.findings = Array.from({ length: 26 }, () => ({
    ...oversized.findings[0],
  }));
  assert.throws(() => validateScoutImportInput(oversized));

  const invalidRun = input();
  invalidRun.run.finishedAt = '2026-09-05T19:59:00Z';
  invalidRun.run.sourceChecks.push({ ...invalidRun.run.sourceChecks[0] });
  assert.throws(() => validateScoutImportInput(invalidRun));
});

void test('validation bounds run, source, finding, publication, and verification timestamps', () => {
  const now = Date.parse('2026-09-05T20:05:00Z');

  const futureRun = input();
  futureRun.run.startedAt = '2026-09-05T20:16:00Z';
  futureRun.run.finishedAt = '2026-09-05T20:16:00Z';
  futureRun.run.sourceChecks[0].checkedAt = '2026-09-05T20:16:00Z';
  futureRun.run.sourceChecks[0].coverageThrough = '2026-09-05T20:16:00Z';
  futureRun.findings[0].observedAt = '2026-09-05T20:16:00Z';
  assert.ok(
    validationIssues(futureRun, now).some(
      (issue) =>
        issue.path === 'run.finishedAt' && issue.code === 'future_timestamp',
    ),
  );

  const overlongRun = input();
  overlongRun.run.startedAt = '2026-09-04T19:59:00Z';
  assert.ok(
    validationIssues(overlongRun, now).some(
      (issue) =>
        issue.path === 'run.finishedAt' && issue.code === 'run_too_long',
    ),
  );

  const earlyCheck = input();
  earlyCheck.run.sourceChecks[0].checkedAt = '2026-09-05T19:40:00Z';
  earlyCheck.run.sourceChecks[0].coverageThrough = '2026-09-05T19:40:00Z';
  assert.ok(
    validationIssues(earlyCheck, now).some(
      (issue) =>
        issue.path === 'run.sourceChecks.0.checkedAt' &&
        issue.code === 'timestamp_outside_run',
    ),
  );

  const futureCoverage = input();
  futureCoverage.run.sourceChecks[0].coverageThrough = '2026-09-05T20:13:00Z';
  assert.ok(
    validationIssues(futureCoverage, now).some(
      (issue) =>
        issue.path === 'run.sourceChecks.0.coverageThrough' &&
        issue.code === 'future_coverage',
    ),
  );

  const earlyFinding = input();
  earlyFinding.findings[0].observedAt = '2026-09-05T19:40:00Z';
  assert.ok(
    validationIssues(earlyFinding, now).some(
      (issue) =>
        issue.path === 'findings.0.observedAt' &&
        issue.code === 'timestamp_outside_run',
    ),
  );

  const futurePublication = input();
  futurePublication.findings[0].publishedAt = '2026-09-05T20:13:00Z';
  assert.ok(
    validationIssues(futurePublication, now).some(
      (issue) =>
        issue.path === 'findings.0.publishedAt' &&
        issue.code === 'future_publication',
    ),
  );

  const earlyVerification = input();
  earlyVerification.findings[0].verificationStatus = 'retailer_checked';
  earlyVerification.findings[0].verificationEvidence = {
    url: 'https://shop.example/items/test',
    observedAt: '2026-09-05T19:40:00Z',
    note: null,
  };
  assert.ok(
    validationIssues(earlyVerification, now).some(
      (issue) =>
        issue.path === 'findings.0.verificationEvidence.observedAt' &&
        issue.code === 'timestamp_outside_run',
    ),
  );
});

void test('validation accepts future official events and actionable registration deadlines', () => {
  const candidate = input();
  const sourceIdentifier = 'official:riftbound:event-registration';
  candidate.run.sourceChecks = [
    {
      sourceIdentifier,
      status: 'checked',
      checkedAt: '2026-09-05T20:02:00Z',
      coverageThrough: '2026-09-05T20:02:00Z',
      errorCode: null,
      detail: null,
    },
  ];
  candidate.findings = [
    {
      ...candidate.findings[0],
      sourceKind: 'official',
      sourceIdentifier,
      headline: 'TEST RECORD: official T1 registration window',
      productName: 'TEST RECORD: T1 set',
      updateType: 'release',
      summary:
        'TEST RECORD: official registration is open before the future release.',
      sourceUrl: 'https://official.example/events/t1',
      subreddit: null,
      sourcePostOrCommentId: null,
      retailerOrOfficialUrl: 'https://official.example/events/t1',
      publishedAt: '2026-09-05T19:00:00Z',
      eventAt: '2026-10-25',
      actionOpensAt: '2026-09-06T08:00:00+02:00',
      actionDeadlineAt: '2026-09-20T23:59:00+02:00',
      actionType: 'register',
      actionInstruction: 'Register through the official event page.',
      actionUrl: 'https://official.example/events/t1/register',
      lifecycleStatus: 'registration_open',
      verificationStatus: 'official_checked',
      verificationEvidence: {
        url: 'https://official.example/events/t1',
        observedAt: '2026-09-05T20:02:00Z',
        note: 'TEST RECORD: official page checked during this run.',
      },
    },
  ];

  const parsed = validateScoutImportInput(
    candidate,
    Date.parse('2026-09-05T20:05:00Z'),
  );
  assert.equal(parsed.findings[0].sourceKind, 'official');
  assert.equal(parsed.findings[0].eventAt, '2026-10-25');
  assert.equal(parsed.findings[0].actionType, 'register');
  assert.equal(
    parsed.findings[0].actionDeadlineAt,
    '2026-09-20T23:59:00+02:00',
  );
});

void test('validation rejects incomplete action details and reversed action windows', () => {
  const now = Date.parse('2026-09-05T20:05:00Z');

  const missingType = input();
  missingType.findings[0].actionInstruction = 'Register before the deadline.';
  missingType.findings[0].actionDeadlineAt = '2026-09-20T23:59:00+02:00';
  assert.ok(
    validationIssues(missingType, now).some(
      (issue) => issue.path === 'findings.0.actionType',
    ),
  );

  const missingInstruction = input();
  missingInstruction.findings[0].actionType = 'register';
  assert.ok(
    validationIssues(missingInstruction, now).some(
      (issue) => issue.path === 'findings.0.actionInstruction',
    ),
  );

  const reversedWindow = input();
  reversedWindow.findings[0].actionType = 'register';
  reversedWindow.findings[0].actionInstruction =
    'Register through the official page.';
  reversedWindow.findings[0].actionOpensAt = '2026-09-21T08:00:00+02:00';
  reversedWindow.findings[0].actionDeadlineAt = '2026-09-20T23:59:00+02:00';
  assert.ok(
    validationIssues(reversedWindow, now).some(
      (issue) => issue.path === 'findings.0.actionDeadlineAt',
    ),
  );

  const impossibleDate = input();
  impossibleDate.findings[0].eventAt = '2026-02-31';
  assert.ok(
    validationIssues(impossibleDate, now).some(
      (issue) => issue.path === 'findings.0.eventAt',
    ),
  );

  const mixedPrecision = input();
  mixedPrecision.findings[0].actionType = 'register';
  mixedPrecision.findings[0].actionInstruction = 'Check registration status.';
  mixedPrecision.findings[0].actionOpensAt = '2026-09-20T08:00:00+02:00';
  mixedPrecision.findings[0].actionDeadlineAt = '2026-09-20';
  assert.doesNotThrow(() => validateScoutImportInput(mixedPrecision, now));
});

void test('validation accepts attributable official, retailer, and marketplace web sources', () => {
  const candidate = input();
  const sourceIdentifiers = [
    'official:pokemon-news',
    'retailer:amazon-de',
    'marketplace:ebay-nl',
    'marketplace:marktplaats-nl',
  ] as const;
  candidate.run.sourceChecks = sourceIdentifiers.map((sourceIdentifier) => ({
    sourceIdentifier,
    status: 'checked' as const,
    checkedAt: '2026-09-05T20:02:00Z',
    coverageThrough: '2026-09-05T20:02:00Z',
    errorCode: null,
    detail: null,
  }));
  const sourceCases = [
    {
      sourceKind: 'official' as const,
      sourceIdentifier: sourceIdentifiers[0],
      sourceUrl: 'https://www.pokemon.com/us/pokemon-news/test-record',
      retailerName: null,
      verificationStatus: 'official_checked' as const,
    },
    {
      sourceKind: 'retailer' as const,
      sourceIdentifier: sourceIdentifiers[1],
      sourceUrl: 'https://www.amazon.de/dp/TESTRECORD',
      retailerName: 'Amazon DE',
      verificationStatus: 'retailer_checked' as const,
    },
    {
      sourceKind: 'public_web' as const,
      sourceIdentifier: sourceIdentifiers[2],
      sourceUrl: 'https://www.ebay.nl/itm/100000000000',
      retailerName: 'eBay NL',
      verificationStatus: 'retailer_checked' as const,
    },
    {
      sourceKind: 'public_web' as const,
      sourceIdentifier: sourceIdentifiers[3],
      sourceUrl: 'https://www.marktplaats.nl/v/test-record',
      retailerName: 'Marktplaats',
      verificationStatus: 'retailer_checked' as const,
    },
  ];
  candidate.findings = sourceCases.map((source) => ({
    ...candidate.findings[0],
    ...source,
    headline: `TEST RECORD: ${source.sourceIdentifier}`,
    sourcePostOrCommentId: null,
    subreddit: null,
    retailerOrOfficialUrl: source.sourceUrl,
    verificationEvidence: {
      url: source.sourceUrl,
      observedAt: '2026-09-05T20:02:00Z',
      note: 'TEST RECORD: source checked during this run.',
    },
  }));

  const parsed = validateScoutImportInput(
    candidate,
    Date.parse('2026-09-05T20:05:00Z'),
  );
  assert.deepEqual(
    parsed.findings.map((finding) => finding.sourceKind),
    ['official', 'retailer', 'public_web', 'public_web'],
  );
  assert.deepEqual(
    parsed.run.sourceChecks.map((check) => check.sourceIdentifier),
    sourceIdentifiers,
  );
});

void test('source check sanitation normalizes control characters and redacts personal data', () => {
  const sanitized = sanitizeScoutSourceCheck({
    ...input().run.sourceChecks[0],
    errorCode: '\u0000 upstream_error \n admin@example.test ',
    detail: ' Contact admin@example.test\n or +31 6 1234 5678 for access. ',
  });
  assert.equal(sanitized.errorCode, 'upstream_error [redacted email]');
  assert.doesNotMatch(sanitized.detail ?? '', /admin@example\.test/);
  assert.doesNotMatch(sanitized.detail ?? '', /1234 5678/);
  assert.match(sanitized.detail ?? '', /\[redacted email\]/);
  assert.match(sanitized.detail ?? '', /\[redacted phone\]/);
  assert.doesNotMatch(sanitized.detail ?? '', /[\r\n]/);
});

void test('canonical URLs drop tracking fragments while distinct sellers keep distinct identities', async () => {
  assert.equal(
    canonicalizeScoutUrl(
      'https://shop.example/item?utm_source=reddit&sku=123#stock',
    ),
    'https://shop.example/item?sku=123',
  );
  const first = sanitizeScoutFinding({
    ...input().findings[0],
    sourceKind: 'retailer',
    sourceUrl: null,
    subreddit: null,
    sourcePostOrCommentId: null,
    retailerName: 'Seller Alpha',
    retailerOrOfficialUrl: 'https://market.example/listing/123',
  });
  const second = { ...first, retailerName: 'Seller Beta' };
  assert.notEqual(
    await hashScoutValue(scoutFindingIdentity(first)),
    await hashScoutValue(scoutFindingIdentity(second)),
  );
});

void test('run status separates complete, partial, and inaccessible coverage', () => {
  const checked = input().run.sourceChecks[0];
  assert.equal(deriveScoutRunStatus([checked], 0), 'completed');
  assert.equal(deriveScoutRunStatus([checked], 1), 'partial');
  assert.equal(
    deriveScoutRunStatus(
      [{ ...checked, status: 'inaccessible', detail: 'Login wall.' }],
      0,
    ),
    'failed',
  );
});
