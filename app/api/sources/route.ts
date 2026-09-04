import { connectorRegistry } from '@/lib/connectors/registry';
import { sources } from '@/lib/fixtures';

export function GET() {
  const connectors = connectorRegistry.map(
    ({ connector: _connector, ...state }) => state,
  );
  return Response.json({
    mode: 'demo',
    data: sources,
    connectors,
    liveConnectors: connectors.filter(
      (connector) => connector.enabled && connector.status !== 'fixture',
    ).length,
  });
}
