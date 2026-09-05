import { getD1 } from '@/db';
import { qualifiesForQuickFlip, serializeDealForPublicApi } from '@/lib/domain';
import { listProductionDeals } from '@/lib/repositories/scans';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  const qualified = url.searchParams.get('qualified');
  const records = (await listProductionDeals(getD1())).filter(
    (deal) =>
      (!game || deal.game.toLowerCase() === game.toLowerCase()) &&
      (qualified !== 'true' || qualifiesForQuickFlip(deal)),
  );
  return Response.json({
    dataMode: 'production',
    data: records.map(serializeDealForPublicApi),
    count: records.length,
    productionCount: records.length,
  });
}
