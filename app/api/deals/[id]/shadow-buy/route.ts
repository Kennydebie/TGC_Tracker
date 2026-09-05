import { getD1 } from '@/db';
import { listProductionDeals } from '@/lib/repositories/scans';
import { createShadowTrade } from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
  try {
    return Response.json(
      {
        dataMode: 'production',
        data: await createShadowTrade(getD1(), user, deal),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Shadow trade failed' },
      { status: 409 },
    );
  }
}
