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
  const createdAt = Date.now();
  return Response.json(
    {
      mode: 'demo',
      data: {
        id: crypto.randomUUID(),
        dealId: id,
        detectedPrice: deal.economics.itemPrice,
        executablePrice: deal.economics.itemPrice,
        predictedProfit: deal.economics.conservativeProfit,
        status: 'open',
        followUps: [7, 30, 90].map((days) =>
          new Date(createdAt + days * 86_400_000).toISOString(),
        ),
      },
    },
    { status: 201 },
  );
}
