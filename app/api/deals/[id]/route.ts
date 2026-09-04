import { deals } from '@/lib/fixtures';
import { qualifiesForQuickFlip } from '@/lib/domain';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal = deals.find((item) => item.id === id);
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json({
    mode: 'demo',
    data: { ...deal, passesQuickFlipGate: qualifiesForQuickFlip(deal) },
  });
}
