import { getD1 } from '@/db';
import { deals } from '@/lib/fixtures';
import { qualifiesForQuickFlip } from '@/lib/domain';
import { listProductionDeals } from '@/lib/repositories/scans';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal =
    deals.find((item) => item.id === id) ??
    (await listProductionDeals(getD1())).find((item) => item.id === id);
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json({
    dataMode: deal.dataMode,
    data: { ...deal, passesQuickFlipGate: qualifiesForQuickFlip(deal) },
  });
}
