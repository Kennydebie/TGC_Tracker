import { getD1 } from '@/db';
import { listMarktplaatsDashboard } from '@/lib/repositories/marktplaats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await listMarktplaatsDashboard(getD1());
  return Response.json(
    { data },
    {
      headers: {
        'cache-control': 'private, no-store',
      },
    },
  );
}
