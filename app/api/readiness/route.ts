export function GET() {
  return Response.json({
    ready: true,
    checks: {
      application: 'ok',
      database: 'binding injected by Sites at publish time',
      externalConnectors: 'optional',
    },
    timestamp: new Date().toISOString(),
  });
}
