import { FixtureConnector } from './fixtures.ts';
import { EbayBrowseConnector } from './ebay.ts';
import type { SourceConnector } from './types.ts';

type ConnectorState = {
  id: string;
  enabled: boolean;
  status: string;
  requirement: string;
  connector?: SourceConnector;
};

const ebay = new EbayBrowseConnector({
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
  marketplace: process.env.EBAY_MARKETPLACE ?? 'EBAY_NL',
});
const ebayEnabled = Boolean(
  process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET,
);

export const connectorRegistry: ConnectorState[] = [
  {
    id: 'fixture-market',
    enabled: true,
    status: 'fixture',
    requirement: 'None',
    connector: new FixtureConnector(),
  },
  {
    id: 'ebay',
    enabled: ebayEnabled,
    status: ebayEnabled ? 'configured' : 'credentials_required',
    requirement: 'EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
    connector: ebay,
  },
  {
    id: 'marktplaats',
    enabled: false,
    status: 'credentials_required',
    requirement:
      'Authorized Marktplaats OAuth credentials; no scraping fallback',
  },
  {
    id: 'cardmarket-public',
    enabled: false,
    status: 'official_urls_required',
    requirement: 'Official catalogue and price-guide download URLs',
  },
  {
    id: 'tcgplayer',
    enabled: false,
    status: 'existing_key_only',
    requirement: 'Existing developer credentials; new access is not assumed',
  },
];

export function getEnabledConnectors(): SourceConnector[] {
  return connectorRegistry.flatMap((item) =>
    item.enabled && item.connector ? [item.connector] : [],
  );
}
