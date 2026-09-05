import { connectorRegistry } from '@/lib/connectors/registry';

export function GET() {
  const connectors = connectorRegistry
    .filter((item) => item.id !== 'fixture-market' && item.status !== 'fixture')
    .map(({ connector: _connector, ...state }) => state);
  return Response.json({
    mode: 'production',
    data: connectors,
    connectors,
    liveConnectors: connectors.filter((connector) => connector.enabled).length,
  });
}
