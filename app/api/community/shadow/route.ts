import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json(
    {
      status: 'unavailable',
      dataMode: 'production',
      error:
        'Community Shadow Mode is unavailable until a market-verified production workflow is implemented.',
    },
    { status: 409 },
  );
}
