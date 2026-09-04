import { releases } from '@/lib/fixtures';

export function GET(request: Request) {
  const officialOnly =
    new URL(request.url).searchParams.get('official') === 'true';
  const data = releases.filter((release) => !officialOnly || release.official);
  return Response.json({
    mode: 'demo',
    data,
    timezone: 'Europe/Amsterdam',
    officialCount: data.filter((item) => item.official).length,
    unconfirmedCount: data.filter((item) => !item.official).length,
  });
}
