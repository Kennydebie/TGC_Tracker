import { getD1 } from '@/db';
import { deals } from '@/lib/fixtures';
import {
  createPurchase,
  listInventoryLots,
} from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json({
    dataMode: 'demo',
    data: await listInventoryLots(getD1(), user),
  });
}

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as {
    dealId?: string;
    quantity?: number;
    itemPrice?: number;
    acquisitionCosts?: number;
    strategy?: string;
  };
  const deal = deals.find((item) => item.id === body.dealId);
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  if (
    !Number.isInteger(body.quantity) ||
    Number(body.quantity) < 1 ||
    Number(body.quantity) > 10_000 ||
    !Number.isFinite(body.itemPrice) ||
    Number(body.itemPrice) < 0 ||
    Number(body.itemPrice) > 1_000_000 ||
    !Number.isFinite(body.acquisitionCosts) ||
    Number(body.acquisitionCosts) < 0 ||
    Number(body.acquisitionCosts) > 1_000_000
  )
    return Response.json(
      { error: 'Invalid purchase payload' },
      { status: 400 },
    );
  const data = await createPurchase(getD1(), user, {
    deal,
    quantity: Number(body.quantity),
    itemPrice: Number(body.itemPrice),
    acquisitionCosts: Number(body.acquisitionCosts),
    strategy: String(body.strategy ?? 'Quick flip').slice(0, 80),
  });
  return Response.json({ dataMode: 'demo', data }, { status: 201 });
}
