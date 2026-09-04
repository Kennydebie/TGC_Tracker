import { getFixtureCommunityProduct } from '@/lib/repositories/community';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as { eventId?: string };
  const eventId = body.eventId?.trim().slice(0, 200);
  const product = eventId ? getFixtureCommunityProduct(eventId) : null;
  if (!product)
    return Response.json(
      {
        error:
          'Production verification runs automatically against configured official connectors.',
      },
      { status: 404 },
    );
  return Response.json({
    status: product.verificationStatus,
    dataMode: 'fixture',
    marketEvidence: product.marketEvidence,
    communityOnlyBuyBlocked: true,
    message:
      product.verificationStatus === 'confirmed'
        ? 'Fixture market evidence confirmed the report. Normal deal economics remain authoritative.'
        : 'Fixture market evidence did not confirm an actionable deal.',
  });
}
