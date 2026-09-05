import { getD1 } from '@/db';
import { listShadowTrades } from '@/lib/repositories/user-state';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const data = (await listShadowTrades(getD1(), user)).filter(
    (trade) => trade.dataMode === 'production',
  );
  return Response.json({
    dataMode: 'production',
    data,
    metrics: {
      executabilityRate: null,
      qualifiedDealPrecision: null,
      baselinePrecision: null,
      falsePositiveRate: null,
      averageValueError: null,
    },
  });
}
