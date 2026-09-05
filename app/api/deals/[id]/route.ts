import { getD1 } from '@/db';
import { qualifiesForQuickFlip, serializeDealForPublicApi } from '@/lib/domain';
import { listProductionDeals } from '@/lib/repositories/scans';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal = (await listProductionDeals(getD1())).find(
    (item) => item.id === id && item.dataMode === 'production',
  );
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json({
    dataMode: deal.dataMode,
    data: {
      ...serializeDealForPublicApi(deal),
      passesQuickFlipGate: qualifiesForQuickFlip(deal),
    },
  });
}
