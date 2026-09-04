import { runFixtureScan } from '@/lib/services/scanning';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  let query = 'pokemon';
  try {
    const body = (await request.json()) as { query?: string };
    if (body.query) query = body.query.slice(0, 120);
  } catch {
    /* default query */
  }
  return Response.json(
    { mode: 'demo', data: await runFixtureScan(query) },
    { status: 202 },
  );
}
