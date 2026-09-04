import { getD1 } from '@/db';
import { deals } from '@/lib/fixtures';
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
  const deal = deals.find((item) => item.id === id);
  if (!deal) return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json(
    {
      dataMode: 'demo',
      data: await createShadowTrade(getD1(), user, deal),
    },
    { status: 201 },
  );
}
