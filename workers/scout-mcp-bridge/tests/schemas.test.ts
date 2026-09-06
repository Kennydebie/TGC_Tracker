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

function issuePaths(value: unknown): string[] {
  const result = saveFindingsInputSchema.safeParse(value);
  expect(result.success).toBe(false);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('finding contract', () => {
  it('normalizes omitted unknown fields without inventing facts', () => {
    const parsed = saveFindingsInputSchema.parse(base);
    expect(parsed.findings[0]?.productName).toBeNull();
    expect(parsed.findings[0]?.collectionMethod).toBe('chatgpt_web_research');
  });

  it('accepts One Piece TCG and rejects unknown games', () => {
    const onePiece = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    if (onePiece.findings[0]) onePiece.findings[0].game = 'one_piece';
    const parsed = saveFindingsInputSchema.safeParse(onePiece);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.findings[0]?.game).toBe('one_piece');

    const unknown = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    if (unknown.findings[0]) unknown.findings[0].game = 'unknown_tcg';
    expect(saveFindingsInputSchema.safeParse(unknown).success).toBe(false);
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

  it('accepts a future official event with an actionable registration deadline', () => {
    const candidate = structuredClone(base) as unknown as {
      run: { sourceChecks: Array<Record<string, unknown>> };
      findings: Array<Record<string, unknown>>;
    };
    const sourceIdentifier = 'official:riftbound:event-registration';
    const sourceUrl = 'https://official.example/events/t1';
    candidate.run.sourceChecks[0] = {
      sourceIdentifier,
      status: 'checked',
      checkedAt: '2026-09-06T10:00:30.000Z',
    };
    const finding = candidate.findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;
    delete finding.subreddit;
    delete finding.sourcePostOrCommentId;
    Object.assign(finding, {
      sourceKind: 'official',
      sourceIdentifier,
      headline: 'TEST RECORD: official T1 registration window',
      updateType: 'release',
      summary:
        'TEST RECORD: official registration is open before the future release.',
      sourceUrl,
      retailerOrOfficialUrl: sourceUrl,
      publishedAt: '2026-09-06T09:30:00.000Z',
      eventAt: '2026-10-25',
      actionOpensAt: '2026-09-07T08:00:00+02:00',
      actionDeadlineAt: '2026-09-20T23:59:00+02:00',
      actionType: 'register',
      actionInstruction: 'Register through the official event page.',
      actionUrl: 'https://official.example/events/t1/register',
      lifecycleStatus: 'registration_open',
      verificationStatus: 'official_checked',
      verificationEvidence: {
        url: sourceUrl,
        observedAt: '2026-09-06T10:00:40.000Z',
      },
    });

    const result = saveFindingsInputSchema.safeParse(candidate);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.findings[0]?.eventAt).toBe('2026-10-25');
    expect(result.data.findings[0]?.actionDeadlineAt).toBe(
      '2026-09-20T23:59:00+02:00',
    );
    expect(result.data.findings[0]?.actionType).toBe('register');
  });

  it('rejects incomplete action details and reversed action windows', () => {
    const missingType = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    Object.assign(missingType.findings[0] ?? {}, {
      actionInstruction: 'Register before the deadline.',
      actionDeadlineAt: '2026-09-20T23:59:00+02:00',
    });
    expect(issuePaths(missingType)).toContain('findings.0.actionType');

    const missingInstruction = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    Object.assign(missingInstruction.findings[0] ?? {}, {
      actionType: 'register',
    });
    expect(issuePaths(missingInstruction)).toContain(
      'findings.0.actionInstruction',
    );

    const reversedWindow = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    Object.assign(reversedWindow.findings[0] ?? {}, {
      actionType: 'register',
      actionInstruction: 'Register through the official page.',
      actionOpensAt: '2026-09-21T08:00:00+02:00',
      actionDeadlineAt: '2026-09-20T23:59:00+02:00',
    });
    expect(issuePaths(reversedWindow)).toContain('findings.0.actionDeadlineAt');

    const impossibleDate = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    Object.assign(impossibleDate.findings[0] ?? {}, {
      eventAt: '2026-02-31',
    });
    expect(issuePaths(impossibleDate)).toContain('findings.0.eventAt');

    const mixedPrecision = structuredClone(base) as unknown as {
      findings: Array<Record<string, unknown>>;
    };
    Object.assign(mixedPrecision.findings[0] ?? {}, {
      actionType: 'register',
      actionInstruction: 'Check registration status.',
      actionOpensAt: '2026-09-20T08:00:00+02:00',
      actionDeadlineAt: '2026-09-20',
    });
    expect(saveFindingsInputSchema.safeParse(mixedPrecision).success).toBe(
      true,
    );
  });

  it('accepts attributable official, retailer, and marketplace web sources', () => {
    const candidate = structuredClone(base) as unknown as {
      run: { sourceChecks: Array<Record<string, unknown>> };
      findings: Array<Record<string, unknown>>;
    };
    const sourceCases = [
      {
        sourceKind: 'official',
        sourceIdentifier: 'official:pokemon-news',
        sourceUrl: 'https://www.pokemon.com/us/pokemon-news/test-record',
        retailerName: null,
        verificationStatus: 'official_checked',
      },
      {
        sourceKind: 'retailer',
        sourceIdentifier: 'retailer:amazon-de',
        sourceUrl: 'https://www.amazon.de/dp/TESTRECORD',
        retailerName: 'Amazon DE',
        verificationStatus: 'retailer_checked',
      },
      {
        sourceKind: 'public_web',
        sourceIdentifier: 'marketplace:ebay-nl',
        sourceUrl: 'https://www.ebay.nl/itm/100000000000',
        retailerName: 'eBay NL',
        verificationStatus: 'retailer_checked',
      },
      {
        sourceKind: 'public_web',
        sourceIdentifier: 'marketplace:marktplaats-nl',
        sourceUrl: 'https://www.marktplaats.nl/v/test-record',
        retailerName: 'Marktplaats',
        verificationStatus: 'retailer_checked',
      },
    ] as const;
    candidate.run.sourceChecks = sourceCases.map(({ sourceIdentifier }) => ({
      sourceIdentifier,
      status: 'checked',
      checkedAt: '2026-09-06T10:00:30.000Z',
    }));
    const template = candidate.findings[0];
    expect(template).toBeDefined();
    if (!template) return;
    candidate.findings = sourceCases.map((source) => {
      const finding = structuredClone(template);
      delete finding.subreddit;
      delete finding.sourcePostOrCommentId;
      return {
        ...finding,
        ...source,
        headline: `TEST RECORD: ${source.sourceIdentifier}`,
        sourceUrl: source.sourceUrl,
        retailerOrOfficialUrl: source.sourceUrl,
        verificationEvidence: {
          url: source.sourceUrl,
          observedAt: '2026-09-06T10:00:40.000Z',
        },
      };
    });

    const result = saveFindingsInputSchema.safeParse(candidate);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.findings.map((finding) => finding.sourceKind)).toEqual([
      'official',
      'retailer',
      'public_web',
      'public_web',
    ]);
  });
});
