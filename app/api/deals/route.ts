import { deals } from '@/lib/fixtures';
import { qualifiesForQuickFlip } from '@/lib/domain';

export function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  const qualified = url.searchParams.get('qualified');
  const records = deals.filter(
    (deal) =>
      (!game || deal.game.toLowerCase() === game.toLowerCase()) &&
      (qualified !== 'true' || qualifiesForQuickFlip(deal)),
  );
  return Response.json({
    mode: 'demo',
    data: records,
    count: records.length,
    warning: 'Fictional fixture records; never mixed with production.',
  });
}
