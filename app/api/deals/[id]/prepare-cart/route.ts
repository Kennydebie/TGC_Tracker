import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  return Response.json(
    {
      status: 'unavailable',
      dataMode: 'production',
      dealId: id,
      error:
        'Cart preparation is unavailable until a production marketplace flow is implemented.',
    },
    { status: 409 },
  );
}
