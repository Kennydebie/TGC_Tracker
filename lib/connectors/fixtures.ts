import type {
  HealthResult,
  NormalisedOffer,
  RawSourceRecord,
  ScanInput,
  SourceCapability,
  SourceConnector,
  SourcePolicy,
  ValidationResult,
} from './types.ts';

const fixtureRecords: RawSourceRecord[] = [
  {
    sourceId: 'fixture-market',
    externalId: 'fx-001',
    capturedAt: '2026-09-04T06:30:00Z',
    payload: {
      title: '2x Prismatic Evolutions ETB — ophalen of verzenden',
      price: 118,
      shipping: 6.95,
      currency: 'EUR',
      quantity: 2,
      condition: 'sealed',
      language: 'en',
      seller: 'Cardzolder88',
    },
  },
  {
    sourceId: 'fixture-market',
    externalId: 'fx-002',
    capturedAt: '2026-09-04T06:32:00Z',
    payload: {
      title: 'Pokemon 151 display box ONLY leeg / empty — read!',
      price: 22,
      shipping: 6.95,
      currency: 'EUR',
      quantity: 1,
      condition: 'empty packaging',
      language: 'nl',
      seller: 'poke_stuff_nl',
    },
  },
];

export class FixtureConnector implements SourceConnector {
  id = 'fixture-market';
  name = 'Isolated Demo Marketplace';
  capabilities: SourceCapability[] = [
    'listing_search',
    'listing_details',
    'market_price',
  ];

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }
  async healthCheck(): Promise<HealthResult> {
    return {
      ok: true,
      status: 'fixture',
      checkedAt: new Date().toISOString(),
      detail: 'No external network requests.',
    };
  }
  async scan(input: ScanInput): Promise<RawSourceRecord[]> {
    return fixtureRecords
      .filter((record) =>
        JSON.stringify(record.payload)
          .toLowerCase()
          .includes(input.query.toLowerCase()),
      )
      .slice(0, input.limit);
  }
  async normalise(record: RawSourceRecord): Promise<NormalisedOffer[]> {
    if (!record.payload || typeof record.payload !== 'object') return [];
    const value = record.payload as Record<string, unknown>;
    if (typeof value.title !== 'string' || typeof value.price !== 'number')
      return [];
    return [
      {
        sourceId: record.sourceId,
        externalId: record.externalId,
        title: value.title,
        url: `https://demo.invalid/listing/${encodeURIComponent(record.externalId)}`,
        itemPrice: value.price,
        shipping: typeof value.shipping === 'number' ? value.shipping : null,
        currency: typeof value.currency === 'string' ? value.currency : 'EUR',
        quantity: typeof value.quantity === 'number' ? value.quantity : null,
        condition: typeof value.condition === 'string' ? value.condition : null,
        language: typeof value.language === 'string' ? value.language : null,
        seller: typeof value.seller === 'string' ? value.seller : null,
        available: true,
      },
    ];
  }
  getPolicy(): SourcePolicy {
    return {
      access: 'fixture',
      respectsRobots: true,
      permitsAutomatedFetch: true,
      checkoutAllowed: false,
      notes: 'Clearly labelled, fictional records isolated from production.',
    };
  }
}
