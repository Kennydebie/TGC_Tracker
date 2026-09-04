import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import {
  listAmazonDashboard,
  listAmazonWatchRules,
} from '@/lib/repositories/amazon';
import { getRequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  const keyAvailable = Boolean(env.KEEPA_API_KEY?.trim());
  const [data, watchRules] = await Promise.all([
    listAmazonDashboard(getD1(), keyAvailable),
    user ? listAmazonWatchRules(getD1(), user.id) : Promise.resolve([]),
  ]);
  return Response.json(
    { data, watchRules },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
