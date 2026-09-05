import { getD1 } from '@/db';
import { listProductionDeals } from '@/lib/repositories/scans';
import { setTrackedDeal } from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

async function update(
  request: Request,
  params: Promise<{ id: string }>,
  tracked: boolean,
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const { id } = await params;
  const deal = (await listProductionDeals(getD1())).find(
    (item) => item.id === id,
  );
  if (!deal)
    return Response.json({ error: 'Live deal not found' }, { status: 404 });
  return Response.json({
    dataMode: 'production',
    dealId: id,
    tracked: await setTrackedDeal(getD1(), user, deal, tracked),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return update(request, params, true);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return update(request, params, false);
}
