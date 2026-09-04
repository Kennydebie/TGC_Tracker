import { getD1 } from '@/db';
import { listShadowTrades } from '@/lib/repositories/user-state';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json({
    dataMode: 'demo',
    data: await listShadowTrades(getD1(), user),
    metrics: {
      executabilityRate: 0.82,
      qualifiedDealPrecision: 0.71,
      baselinePrecision: 0.46,
      falsePositiveRate: 0.14,
      averageValueError: -0.038,
    },
  });
}
