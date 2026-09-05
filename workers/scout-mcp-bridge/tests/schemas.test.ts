import { describe, expect, it } from 'vitest';

import { saveFindingsInputSchema } from '../src/schemas';

const base = {
  run: {
    id: 'research-2026-09-06',
    startedAt: '2026-09-06T10:00:00.000Z',
    finishedAt: '2026-09-06T10:01:00.000Z',
    sourceChecks: [
      {
        sourceIdentifier: 'reddit:r/example',
        status: 'checked',
        checkedAt: '2026-09-06T10:00:30.000Z',
      },
    ],
  },
  findings: [
    {
      sourceKind: 'reddit_post',
      sourceIdentifier: 'reddit:r/example',
      game: 'pokemon',
      updateType: 'restock',
      summary: 'Observed source-backed stock update.',
      subreddit: 'example',
      sourcePostOrCommentId: 'post-1',
      observedAt: '2026-09-06T10:00:40.000Z',
      price: null,
      currency: null,
      shippingToNetherlands: 'unknown',
      availability: 'unknown',
      verificationStatus: 'community_report',
    },
  ],
} as const;

describe('finding contract', () => {
  it('normalizes omitted unknown fields without inventing facts', () => {
    const parsed = saveFindingsInputSchema.parse(base);
    expect(parsed.findings[0]?.productName).toBeNull();
    expect(parsed.findings[0]?.collectionMethod).toBe('chatgpt_web_research');
  });

  it('requires price and currency together', () => {
    const invalid = structuredClone(base) as Record<string, unknown>;
    const findings = invalid.findings as Array<Record<string, unknown>>;
    if (findings[0]) findings[0].price = 10;
    expect(saveFindingsInputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate source checks', () => {
    const invalid = structuredClone(base) as Record<string, unknown>;
    const run = invalid.run as Record<string, unknown>;
    const checks = run.sourceChecks as Array<Record<string, unknown>>;
    checks.push({ ...(checks[0] ?? {}) });
    expect(saveFindingsInputSchema.safeParse(invalid).success).toBe(false);
  });
});
