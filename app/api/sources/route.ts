import { connectorRegistry } from '@/lib/connectors/registry';
import { sources } from '@/lib/fixtures';

export function GET() {
  return Response.json({
    mode: 'demo',
    data: sources,
    connectors: connectorRegistry.map(
      ({ connector: _connector, ...state }) => state,
    ),
    liveConnectors: 0,
  });
}
