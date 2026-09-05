import { getD1 } from '@/db';
import { listReviewItems } from '@/lib/repositories/user-state';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const data = await listReviewItems(getD1(), user);
  return Response.json({ dataMode: 'production', data, count: data.length });
}
