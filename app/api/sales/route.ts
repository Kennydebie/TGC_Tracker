import { getD1 } from '@/db';
import { createSale } from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as {
    inventoryLotId?: string;
    quantity?: number;
    venue?: string;
    gross?: number;
    costs?: number;
  };
  if (
    !body.inventoryLotId ||
    !Number.isInteger(body.quantity) ||
    Number(body.quantity) < 1 ||
    Number(body.quantity) > 10_000 ||
    !Number.isFinite(body.gross) ||
    Number(body.gross) < 0 ||
    Number(body.gross) > 1_000_000 ||
    !Number.isFinite(body.costs) ||
    Number(body.costs) < 0 ||
    Number(body.costs) > 1_000_000
  )
    return Response.json({ error: 'Invalid sale payload' }, { status: 400 });
  try {
    const data = await createSale(getD1(), user, {
      inventoryLotId: body.inventoryLotId,
      quantity: Number(body.quantity),
      venue: String(body.venue ?? 'Other').slice(0, 80),
      gross: Number(body.gross),
      costs: Number(body.costs),
    });
    return Response.json({ dataMode: 'demo', data }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Sale failed' },
      { status: 400 },
    );
  }
}
