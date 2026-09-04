import { getD1 } from '@/db';
import { ignoreCommunityEvent } from '@/lib/repositories/community';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const { id } = await params;
  if (!id || id.length > 200)
    return Response.json({ error: 'Invalid event ID.' }, { status: 400 });
  const result = await ignoreCommunityEvent(getD1(), user, id);
  return Response.json(result);
}
