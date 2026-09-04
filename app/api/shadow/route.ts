import { shadowTrades } from '@/lib/fixtures';

export function GET() {
  return Response.json({
    mode: 'demo',
    data: shadowTrades,
    metrics: {
      executabilityRate: 0.82,
      qualifiedDealPrecision: 0.71,
      baselinePrecision: 0.46,
      falsePositiveRate: 0.14,
      averageValueError: -0.038,
    },
  });
}
