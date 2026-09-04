import { getD1 } from '@/db';
import { deals } from '@/lib/fixtures';
import { qualifiesForQuickFlip } from '@/lib/domain';
import { listProductionDeals } from '@/lib/repositories/scans';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  const qualified = url.searchParams.get('qualified');
  const includeDemo = url.searchParams.get('demo') !== 'false';
  const productionDeals = await listProductionDeals(getD1());
  const allDeals = [...productionDeals, ...(includeDemo ? deals : [])];
  const records = allDeals.filter(
    (deal) =>
      (!game || deal.game.toLowerCase() === game.toLowerCase()) &&
      (qualified !== 'true' || qualifiesForQuickFlip(deal)),
  );
  return Response.json({
    modes: [...new Set(records.map((deal) => deal.dataMode))],
    data: records,
    count: records.length,
    productionCount: records.filter((deal) => deal.dataMode === 'production')
      .length,
    demoCount: records.filter((deal) => deal.dataMode === 'demo').length,
    separation: {
      production: records.filter((deal) => deal.dataMode === 'production')
        .length,
      demo: records.filter((deal) => deal.dataMode === 'demo').length,
    },
    warning:
      'Demo records are explicitly labelled and stored separately from production records.',
  });
}
