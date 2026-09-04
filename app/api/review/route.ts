import { reviewItems } from '@/lib/fixtures';

export function GET() {
  return Response.json({
    mode: 'demo',
    data: reviewItems,
    count: reviewItems.length,
  });
}
