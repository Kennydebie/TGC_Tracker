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
      error: 'Ignoring production deals is not implemented yet.',
    },
    { status: 409 },
  );
}
