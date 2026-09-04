export type SourceCapability =
  | 'listing_search'
  | 'listing_details'
  | 'product_catalogue'
  | 'market_price'
  | 'sold_comps'
  | 'price_history'
  | 'release_feed'
  | 'stock_status'
  | 'cart_assist';

export type SourcePolicy = {
  access: 'official_api' | 'public_file' | 'allowlisted_feed' | 'fixture';
  respectsRobots: boolean;
  permitsAutomatedFetch: boolean;
  checkoutAllowed: false;
  notes: string;
};

export type RawSourceRecord = {
  sourceId: string;
  externalId: string;
  capturedAt: string;
  payload: unknown;
};

export type NormalisedOffer = {
  sourceId: string;
  externalId: string;
  title: string;
  url: string;
  itemPrice: number;
  shipping: number | null;
  currency: string;
  quantity: number | null;
  condition: string | null;
  language: string | null;
  seller: string | null;
  available: boolean;
};

export type ScanInput = { query: string; limit: number; cursor?: string };
export type HealthResult = {
  ok: boolean;
  status: string;
  checkedAt: string;
  detail?: string;
};
export type ValidationResult = { valid: boolean; errors: string[] };

export interface SourceConnector {
  id: string;
  name: string;
  capabilities: SourceCapability[];
  validateConfig(): Promise<ValidationResult>;
  healthCheck(): Promise<HealthResult>;
  scan(input: ScanInput): Promise<RawSourceRecord[]>;
  normalise(record: RawSourceRecord): Promise<NormalisedOffer[]>;
  getPolicy(): SourcePolicy;
}
