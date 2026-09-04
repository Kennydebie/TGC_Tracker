import { deals } from '@/lib/fixtures';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  const deal = deals.find((item) => item.id === id);
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json({
    mode: 'demo',
    dealId: id,
    status: 'available',
    checkedAt: new Date().toISOString(),
    observedItemPrice: deal.economics.itemPrice,
    observedAllInCost: deal.economics.allInCost,
    changed: false,
  });
}
