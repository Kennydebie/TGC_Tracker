import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  listProductionDeals,
  persistScanSummary,
} from '../../lib/repositories/scans.ts';
import type { ScanSummary } from '../../lib/services/scanning.ts';

type SqlValue = string | number | null;

function applyMigrations(database: DatabaseSync) {
  for (const file of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    const migration = readFileSync(`drizzle/${file}`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
  database.exec('PRAGMA foreign_keys = ON');
}

function asD1(database: DatabaseSync) {
  const result = {
    prepare(sql: string) {
      let bindings: SqlValue[] = [];
      const prepared = {
        bind(...values: SqlValue[]) {
          bindings = values;
          return prepared;
        },
        async first<T>() {
          return (
            (database.prepare(sql).get(...bindings) as T | undefined) ?? null
          );
        },
        async all<T>() {
          return {
            success: true,
            results: database.prepare(sql).all(...bindings) as T[],
            meta: { changes: 0 },
          };
        },
        async run() {
          const executed = database.prepare(sql).run(...bindings);
          return {
            success: true,
            results: [],
            meta: { changes: Number(executed.changes) },
          };
        },
      };
      return prepared;
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return result as unknown as D1Database;
}

function productionSummary(): ScanSummary {
  const capturedAt = '2026-09-05T10:00:00.000Z';
  return {
    jobId: 'production-identity-regression',
    startedAt: capturedAt,
    finishedAt: capturedAt,
    durationMs: 0,
    credentials: { ebay: 'configured' },
    queries: ['prismatic evolutions'],
    totals: {
      fetched: 1,
      normalised: 1,
      matched: 1,
      rejected: 0,
      alerted: 0,
    },
    connectors: [
      {
        source: 'ebay',
        fetched: 1,
        normalised: 1,
        matched: 1,
        rejected: 0,
        alerted: 0,
        errors: [],
        records: [
          {
            raw: {
              sourceId: 'ebay',
              externalId: '123456789012',
              capturedAt,
              payload: {
                itemId: '123456789012',
                title: 'Pokémon Prismatic Evolutions ETB sealed English',
                seller: { username: 'market-seller' },
              },
            },
            offer: {
              sourceId: 'ebay',
              externalId: '123456789012',
              sourceListingId: '123456789012',
              sourceMarketplace: 'ebay',
              title: 'Pokémon Prismatic Evolutions ETB sealed English',
              url: 'https://www.ebay.nl/itm/123456789012',
              sourceListingUrl: 'https://www.ebay.nl/itm/123456789012',
              detectedAt: capturedAt,
              lastVerifiedAt: capturedAt,
              availabilityStatus: 'available',
              itemPrice: 59.95,
              shipping: 6.95,
              currency: 'EUR',
              quantity: 1,
              condition: 'New',
              language: 'English',
              seller: 'market-seller',
              available: true,
            },
            productIdentityId: 'pokemon-prismatic-evolutions-etb',
            matchConfidence: 100,
            rejectedReason: null,
            alerted: false,
          },
        ],
      },
    ],
  };
}

void test('real eBay scans persist only observed facts and conservative production economics', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    applyMigrations(database);
    const db = asD1(database);
    await persistScanSummary(db, productionSummary(), {
      ebaySuppressionHmacSecret:
        'test-only-suppression-secret-that-is-long-enough',
    });

    const source = database
      .prepare(`SELECT access_type, mode FROM sources WHERE id = 'ebay'`)
      .get() as Record<string, unknown>;
    assert.equal(source.access_type, 'official_api');
    assert.equal(source.mode, 'Live');

    const stored = database
      .prepare(
        `SELECT listings.demo_record AS listing_demo,
                source_records.demo_record AS source_demo,
                valuation_snapshots.demo_record AS valuation_demo,
                deal_scores.demo_record AS score_demo,
                valuation_snapshots.fair_value_cents,
                valuation_snapshots.observation_count,
                valuation_snapshots.assumptions_json,
                deal_scores.conservative_net_exit_cents,
                deal_scores.expected_profit_cents,
                deal_scores.explanation_json,
                products.name,
                products.language
         FROM listings
         INNER JOIN source_records
           ON source_records.source_listing_id = listings.source_listing_id
         INNER JOIN deal_scores ON deal_scores.listing_id = listings.id
         INNER JOIN valuation_snapshots
           ON valuation_snapshots.id = deal_scores.valuation_id
         INNER JOIN products ON products.id = listings.product_id`,
      )
      .get() as Record<string, unknown>;
    assert.equal(stored.listing_demo, 0);
    assert.equal(stored.source_demo, 0);
    assert.equal(stored.valuation_demo, 0);
    assert.equal(stored.score_demo, 0);
    assert.equal(stored.fair_value_cents, null);
    assert.equal(stored.observation_count, 0);
    assert.equal(stored.conservative_net_exit_cents, 0);
    assert.equal(stored.expected_profit_cents, -6690);
    assert.equal(stored.name, 'Prismatic Evolutions Elite Trainer Box');
    assert.equal(stored.language, 'Unknown');
    assert.doesNotMatch(
      `${String(stored.assumptions_json)}${String(stored.explanation_json)}`,
      /fictional|fixture|demo/i,
    );

    const deals = await listProductionDeals(db);
    assert.equal(deals.length, 1);
    assert.equal(deals[0]?.dataMode, 'production');
    assert.equal(
      deals[0]?.canonicalProduct,
      'Prismatic Evolutions Elite Trainer Box',
    );
    assert.equal(deals[0]?.economics.expectedSalePrice, 0);
    assert.equal(deals[0]?.economics.roi, -1);
  } finally {
    database.close();
  }
});

void test('fixture scan output cannot enter production persistence', async () => {
  const summary = productionSummary();
  summary.connectors[0] = {
    ...summary.connectors[0],
    source: 'fixture-market',
  };
  await assert.rejects(
    persistScanSummary({} as D1Database, summary),
    /test-only and cannot be persisted/,
  );
});
