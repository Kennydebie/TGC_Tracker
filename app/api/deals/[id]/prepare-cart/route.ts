import { deals } from '@/lib/fixtures';
import { createCartToken } from '@/lib/services/cart-token';
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
  let body: { quantity?: number } = {};
  try {
    body = (await request.json()) as { quantity?: number };
  } catch {
    /* Quantity defaults to the listing interpretation. */
  }
  const quantity = body.quantity ?? deal.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > deal.quantity)
    return Response.json(
      { error: 'Quantity exceeds the verified listing quantity' },
      { status: 400 },
    );
  const result = await createCartToken({
    domain: 'demo.invalid',
    dealId: id,
    expectedTitle: deal.canonicalProduct,
    expectedPrice: deal.economics.itemPrice,
    priceTolerance: 0,
    quantity,
  });
  return Response.json({
    mode: 'demo',
    ...result,
    limits: [
      'Extension must recheck identity, price and stock.',
      'User confirmation required.',
      'Stops at cart; never submits checkout or payment.',
    ],
  });
}
