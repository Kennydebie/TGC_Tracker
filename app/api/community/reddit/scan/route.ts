import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import { runRedditCommunityScan } from '@/lib/services/community-radar';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  if (!getRequestUser(request)) return authenticationRequired();
  const result = await runRedditCommunityScan({ db: getD1(), env });
  return Response.json(result, {
    status:
      result.status === 'success'
        ? 200
        : result.status === 'credentials_required'
          ? 424
          : 502,
  });
}
