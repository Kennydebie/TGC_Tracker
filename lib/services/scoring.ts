import type { ConfidenceGrade } from '@/lib/domain';

export type InstantScoreFactors = {
  discount: number;
  margin: number;
  liquidity: number;
  seller: number;
  dataConfidence: number;
  freshness: number;
  crossMarket: number;
  riskPenalty: number;
  confidenceGrade: ConfidenceGrade;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function calculateInstantScore(factors: InstantScoreFactors): number {
  const weighted =
    factors.discount * 0.3 +
    factors.margin * 0.2 +
    factors.liquidity * 0.15 +
    factors.seller * 0.1 +
    factors.dataConfidence * 0.1 +
    factors.freshness * 0.1 +
    factors.crossMarket * 0.05 -
    factors.riskPenalty;
  const capped =
    factors.confidenceGrade === 'D'
      ? Math.min(weighted, 49)
      : factors.confidenceGrade === 'C'
        ? Math.min(weighted, 74)
        : weighted;
  return Math.round(clamp(capped));
}

export function alertDedupeKey(
  userId: string,
  listingId: string,
  kind: string,
  priceCents: number,
): string {
  return `${userId}:${listingId}:${kind}:${Math.round(priceCents / 100)}`;
}

export function cooldownExpired(
  previousAt: number | null,
  cooldownMinutes: number,
  now = Date.now(),
): boolean {
  return previousAt === null || now - previousAt >= cooldownMinutes * 60_000;
}
