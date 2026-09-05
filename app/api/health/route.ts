export function GET() {
  return Response.json({
    status: 'ok',
    service: 'tcg-scout-web',
    version: '0.1.0',
    mode: 'production',
    timestamp: new Date().toISOString(),
  });
}
