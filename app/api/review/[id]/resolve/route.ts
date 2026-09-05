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
  const body = (await request.json()) as {
    resolution?: string;
    details?: Record<string, unknown>;
  };
  try {
    const data = await resolveReviewItem(
      getD1(),
      user,
      id,
      String(body.resolution ?? ''),
      body.details ?? {},
    );
    return Response.json({ dataMode: 'production', data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Review resolution failed',
      },
      { status: 400 },
    );
  }
}
