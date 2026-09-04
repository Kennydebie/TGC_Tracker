import { getD1 } from '@/db';
import { createCommunityShadowTrade } from '@/lib/repositories/community';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as { eventId?: string };
  const eventId = body.eventId?.trim().slice(0, 200);
  if (!eventId)
    return Response.json({ error: 'Event ID is required.' }, { status: 400 });
  try {
    const data = await createCommunityShadowTrade(getD1(), user, eventId);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Shadow evaluation failed.',
      },
      { status: 400 },
    );
  }
}
