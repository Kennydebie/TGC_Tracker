import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeScoutUrl,
  deriveScoutRunStatus,
  hashScoutValue,
  sanitizeScoutFinding,
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
