export function GET() {
  return Response.json({
    mode: 'production',
    status: 'unavailable',
    data: [],
    timezone: 'Europe/Amsterdam',
    officialCount: 0,
    unconfirmedCount: 0,
    message: 'No production release-calendar source is configured yet.',
  });
}
