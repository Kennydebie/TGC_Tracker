import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { deleteEbayUserData } from '../../lib/repositories/ebay-account-deletion.ts';
import { persistScanSummary } from '../../lib/repositories/scans.ts';
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

function run(database: DatabaseSync, sql: string, ...values: SqlValue[]) {
  database.prepare(sql).run(...values);
}

function count(database: DatabaseSync, sql: string, ...values: SqlValue[]) {
  const row = database.prepare(sql).get(...values) as { count: number };
  return Number(row.count);
}

function seedEbayDeletionScenario(database: DatabaseSync) {
  const now = Date.parse('2026-09-05T10:00:00.000Z');
  run(
    database,
    `INSERT INTO users (id, email, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    'local-user',
    'owner@example.test',
    now,
    now,
  );
  for (const [id, name] of [
    ['ebay', 'eBay Browse'],
    ['marktplaats', 'Marktplaats'],
  ]) {
    run(
      database,
      `INSERT INTO sources
       (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
       VALUES (?, ?, 'official_api', 'Live', 1, '{}', ?, ?)`,
      id,
      name,
      now,
      now,
    );
  }
  run(
    database,
    `INSERT INTO products
     (id, game, set_name, name, slug, product_type, language,
      manually_verified, created_at, updated_at)
     VALUES ('product', 'Pokemon', 'Set', 'Card', 'card', 'Card', 'EN', 1, ?, ?)`,
    now,
    now,
  );

  const rawRecords: Array<[string, string, string, string]> = [
    [
      'raw-a-current',
      'ebay',
      'item-a',
      JSON.stringify({ seller: { username: 'Seller-A' }, title: 'current' }),
    ],
    [
      'raw-a-history',
      'ebay',
      'item-a',
      JSON.stringify({ title: 'older revision without a seller field' }),
    ],
    [
      'raw-b',
      'ebay',
      'item-b',
      JSON.stringify({ seller: { username: 'Seller-B' } }),
    ],
  ];
  rawRecords.forEach(([id, sourceId, sourceListingId, payload], index) =>
    run(
      database,
      `INSERT INTO source_records
       (id, source_id, source_listing_id, payload_json, payload_hash,
        captured_at, demo_record)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      id,
      sourceId,
      sourceListingId,
      payload,
      `hash-${index}`,
      now + index,
    ),
  );

  const listings: Array<[string, string, string, string]> = [
    ['listing-a', 'ebay', 'item-a', 'Seller-A'],
    ['listing-b', 'ebay', 'item-b', 'Seller-B'],
    ['listing-m', 'marktplaats', 'item-m', 'Seller-A'],
  ];
  listings.forEach(([id, sourceId, sourceListingId, seller]) =>
    run(
      database,
      `INSERT INTO listings
       (id, source_id, external_id, source_listing_id, source_marketplace,
        product_id, seller_name, title, url, source_listing_url,
        item_price_cents, currency, status, availability_status, detected_at,
        last_verified_at, first_seen_at, last_seen_at, demo_record)
       VALUES (?, ?, ?, ?, ?, 'product', ?, 'Card', ?, ?, 1000, 'EUR',
               'active', 'available', ?, ?, ?, ?, 0)`,
      id,
      sourceId,
      `${sourceId}-${sourceListingId}`,
      sourceListingId,
      sourceId,
      seller,
      `https://example.test/${sourceListingId}`,
      `https://example.test/${sourceListingId}`,
      now,
      now,
      now,
      now,
    ),
  );

  for (const suffix of ['a', 'b']) {
    run(
      database,
      `INSERT INTO listing_snapshots
       (id, listing_id, item_price_cents, currency, availability_status,
        content_hash, observed_at)
       VALUES (?, ?, 1000, 'EUR', 'available', ?, ?)`,
      `snapshot-${suffix}`,
      `listing-${suffix}`,
      `snapshot-hash-${suffix}`,
      now,
    );
    run(
      database,
      `INSERT INTO valuation_snapshots
       (id, product_id, conservative_cents, confidence_grade,
        observation_count, assumptions_json, model_version, valued_at,
        demo_record)
       VALUES (?, 'product', 0, 'D', 0, '{}', 'test', ?, 0)`,
      `valuation-${suffix}`,
      now,
    );
    run(
      database,
      `INSERT INTO deal_scores
       (id, listing_id, valuation_id, instant_score, hold_score, risk_score,
        confidence_grade, all_in_cost_cents, conservative_net_exit_cents,
        expected_profit_cents, roi_bps, profit_per_hour_cents,
        maximum_item_price_cents, maximum_all_in_cost_cents, preferred_exit,
        explanation_json, model_version, scored_at, demo_record)
       VALUES (?, ?, ?, 0, 0, 100, 'D', 1000, 0, -1000, -10000, -1000,
               0, 0, 'None', '{}', 'test', ?, 0)`,
      `score-${suffix}`,
      `listing-${suffix}`,
      `valuation-${suffix}`,
      now,
    );
  }
  run(
    database,
    `INSERT INTO purchases
     (id, user_id, listing_id, product_id, quantity, purchased_at,
      item_price_cents, acquisition_costs_cents, all_in_cost_cents, currency,
      data_mode, created_at, updated_at)
     VALUES ('purchase-a', 'local-user', 'listing-a', 'product', 1, ?,
             1000, 0, 1000, 'EUR', 'production', ?, ?)`,
    now,
    now,
    now,
  );
}

void test('account deletion processing is source-scoped, idempotent, and prevents re-import', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    applyMigrations(database);
    seedEbayDeletionScenario(database);
    const db = asD1(database);
    const hmacSecret = 'a-private-compliance-key-that-is-long-enough';
    const deletion = {
      data: { username: 'seller-a' },
      eventDate: '2026-09-05T10:05:00.000Z',
      hmacSecret,
      notificationId: 'notification-a',
      receivedAt: Date.parse('2026-09-05T10:06:00.000Z'),
      schemaVersion: '1.0',
    };

    const summary = await deleteEbayUserData(db, deletion);
    assert.equal(summary.duplicate, false);
    assert.equal(summary.listings, 1);
    assert.equal(summary.sourceRecords, 2);
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM listings WHERE id = 'listing-a'`,
      ),
      0,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM listings WHERE id IN ('listing-b', 'listing-m')`,
      ),
      2,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM source_records WHERE source_listing_id = 'item-a'`,
      ),
      0,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM source_records WHERE source_listing_id = 'item-b'`,
      ),
      1,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM valuation_snapshots WHERE id = 'valuation-a'`,
      ),
      0,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM valuation_snapshots WHERE id = 'valuation-b'`,
      ),
      1,
    );
    const purchase = database
      .prepare(`SELECT listing_id FROM purchases WHERE id = 'purchase-a'`)
      .get() as { listing_id: string | null };
    assert.equal(purchase.listing_id, null);
    assert.equal(count(database, 'SELECT COUNT(*) AS count FROM products'), 1);
    assert.equal(
      count(
        database,
        'SELECT COUNT(*) AS count FROM ebay_suppressed_identities',
      ),
      1,
    );
    const receipt = database
      .prepare(
        `SELECT status, counts_json FROM ebay_deletion_receipts
         WHERE notification_id = 'notification-a'`,
      )
      .get() as { status: string; counts_json: string };
    assert.equal(receipt.status, 'processed');
    assert.doesNotMatch(JSON.stringify(receipt), /seller-a/i);

    const duplicate = await deleteEbayUserData(db, deletion);
    assert.equal(duplicate.duplicate, true);

    const timestamp = '2026-09-05T10:10:00.000Z';
    const summaryToPersist: ScanSummary = {
      jobId: 'post-deletion-scan',
      startedAt: timestamp,
      finishedAt: timestamp,
      durationMs: 0,
      credentials: { ebay: 'configured' },
      queries: ['card'],
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
                externalId: 'fresh-external',
                capturedAt: timestamp,
                payload: { seller: { username: 'SELLER-A' } },
              },
              offer: {
                sourceId: 'ebay',
                externalId: 'fresh-external',
                sourceListingId: 'fresh-item',
                sourceMarketplace: 'EBAY_NL',
                title: 'Prismatic Evolutions Elite Trainer Box',
                url: 'https://www.ebay.example/fresh-item',
                sourceListingUrl: 'https://www.ebay.example/fresh-item',
                detectedAt: timestamp,
                lastVerifiedAt: timestamp,
                availabilityStatus: 'available',
                itemPrice: 100,
                shipping: 5,
                currency: 'EUR',
                quantity: 1,
                condition: 'New',
                language: 'English',
                seller: 'SELLER-A',
                available: true,
              },
              productIdentityId: 'pokemon-prismatic-evolutions-etb',
              matchConfidence: 95,
              rejectedReason: null,
              alerted: false,
            },
          ],
        },
      ],
    };
    await persistScanSummary(db, summaryToPersist, {
      ebaySuppressionHmacSecret: hmacSecret,
    });
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM source_records
         WHERE source_listing_id = 'fresh-item'`,
      ),
      0,
    );
    assert.equal(
      count(
        database,
        `SELECT COUNT(*) AS count FROM listings
         WHERE source_listing_id = 'fresh-item'`,
      ),
      0,
    );
  } finally {
    database.close();
  }
});
