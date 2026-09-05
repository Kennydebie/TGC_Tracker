import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import {
  createAmazonShadowTrade,
  listAmazonDashboard,
} from '@/lib/repositories/amazon';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json().catch(() => null)) as {
    id?: string;
  } | null;
  if (!body?.id)
    return Response.json(
      { error: 'Amazon opportunity id is required.' },
      { status: 400 },
    );
  const opportunity = (
    await listAmazonDashboard(getD1(), Boolean(env.KEEPA_API_KEY?.trim()))
  ).opportunities.find(
    (item) => item.id === body.id && item.dataMode === 'production',
  );
  if (!opportunity)
    return Response.json(
      { error: 'Amazon opportunity not found.' },
      { status: 404 },
    );
  return Response.json(
    { data: await createAmazonShadowTrade(getD1(), user, opportunity) },
    { status: 201 },
  );
}
