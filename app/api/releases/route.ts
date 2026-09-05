import { releases } from '@/lib/fixtures';
import { sortReleasesChronologically } from '@/lib/workflow-integrity';

export function GET(request: Request) {
  const officialOnly =
    new URL(request.url).searchParams.get('official') === 'true';
  const data = sortReleasesChronologically(
    releases.filter((release) => !officialOnly || release.official),
  );
  return Response.json({
    mode: 'demo',
    data,
    timezone: 'Europe/Amsterdam',
    officialCount: data.filter((item) => item.official).length,
    unconfirmedCount: data.filter((item) => !item.official).length,
  });
}
