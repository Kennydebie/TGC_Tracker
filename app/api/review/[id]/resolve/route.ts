import { getD1 } from '@/db';
import { resolveReviewItem } from '@/lib/repositories/user-state';
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
  let body: { resolution?: string; details?: Record<string, unknown> } = {};
  try {
    body = (await request.json()) as { resolution?: string };
  } catch {
    return Response.json({ error: 'JSON body required' }, { status: 400 });
  }
  if (!body.resolution)
    return Response.json({ error: 'Resolution is required' }, { status: 400 });
  try {
    return Response.json({
      dataMode: 'demo',
      data: await resolveReviewItem(
        getD1(),
        user,
        id,
        body.resolution,
        body.details ?? {},
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review failed';
    return Response.json(
      { error: message },
      { status: message.includes('not found') ? 404 : 400 },
    );
  }
}
