import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json(
    {
      status: 'unavailable',
      dataMode: 'production',
      error:
        'Manual fixture verification has been removed. Production verification runs automatically against configured official connectors.',
    },
    { status: 409 },
  );
}
