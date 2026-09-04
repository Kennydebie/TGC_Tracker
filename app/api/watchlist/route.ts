import { getD1 } from '@/db';
import { listTrackedDealIds } from '@/lib/repositories/user-state';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json({
    dataMode: 'demo',
    dealIds: await listTrackedDealIds(getD1(), user),
  });
}
