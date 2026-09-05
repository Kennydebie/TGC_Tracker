import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';

import {
  ebaySuppressionFingerprints,
  type EbayMarketplaceAccountDeletionData,
} from '../ebay/marketplace-account-deletion.ts';

type SqlTarget = {
  bindings: string[];
  sql: string;
};

export type EbayUserDeletionSummary = {
  alerts: number;
  auditLogs: number;
  communityVerifications: number;
  dealScores: number;
  duplicate: boolean;
  listingSnapshots: number;
  listings: number;
  purchasesDetached: number;
  reviewItems: number;
  shadowEvaluations: number;
  shadowTrades: number;
  sourceRecords: number;
  valuationSnapshots: number;
  watchlistItems: number;
};

export type EbayUserDeletionRequest = {
  data: EbayMarketplaceAccountDeletionData;
  eventDate: string;
  hmacSecret: string;
  notificationId: string;
  receivedAt?: number;
  schemaVersion: string;
};

const EMPTY_SUMMARY: Omit<EbayUserDeletionSummary, 'duplicate'> = {
  alerts: 0,
  auditLogs: 0,
  communityVerifications: 0,
  dealScores: 0,
  listingSnapshots: 0,
  listings: 0,
  purchasesDetached: 0,
  reviewItems: 0,
  shadowEvaluations: 0,
  shadowTrades: 0,
  sourceRecords: 0,
  valuationSnapshots: 0,
  watchlistItems: 0,
};

function identifiers(data: EbayMarketplaceAccountDeletionData) {
  return {
    username: data.username,
    userId: data.userId,
    eiasToken: data.eiasToken,
  };
}

function directSellerPredicate(
  alias: string,
  data: EbayMarketplaceAccountDeletionData,
): SqlTarget {
  const username = identifiers(data).username;
  if (!username) return { sql: '0', bindings: [] };
  return {
    sql: `LOWER(COALESCE(${alias}.seller_name, '')) = LOWER(?)`,
    bindings: [username],
  };
}

function rawIdentityPredicate(
  alias: string,
  data: EbayMarketplaceAccountDeletionData,
): SqlTarget {
  const values = identifiers(data);
  const predicates: string[] = [];
  const bindings: string[] = [];
  if (values.username) {
    predicates.push(
      `LOWER(COALESCE(json_extract(${alias}.payload_json, '$.seller.username'), '')) = LOWER(?)`,
    );
    bindings.push(values.username);
  }
  if (values.userId) {
    predicates.push(
      `LOWER(COALESCE(json_extract(${alias}.payload_json, '$.seller.userId'), '')) = LOWER(?)`,
    );
    bindings.push(values.userId);
  }
  if (values.eiasToken) {
    predicates.push(
      `COALESCE(json_extract(${alias}.payload_json, '$.seller.eiasToken'), '') = ?`,
    );
    bindings.push(values.eiasToken);
  }
  if (!predicates.length) throw new Error('No eBay user identifier supplied.');
  return { sql: `(${predicates.join(' OR ')})`, bindings };
}

function affectedListingTargets(
  data: EbayMarketplaceAccountDeletionData,
): SqlTarget {
  const raw = rawIdentityPredicate('matching_raw', data);
  const seller = directSellerPredicate('direct_listing', data);
  return {
    sql: `SELECT matching_raw.source_listing_id,
                 raw_listing.id AS listing_id
          FROM source_records AS matching_raw
          LEFT JOIN listings AS raw_listing
            ON matching_raw.source_listing_id <> ''
           AND raw_listing.source_listing_id = matching_raw.source_listing_id
           AND (raw_listing.source_id = 'ebay'
                OR raw_listing.source_marketplace = 'ebay')
           AND raw_listing.demo_record = 0
          WHERE matching_raw.source_id = 'ebay'
            AND matching_raw.demo_record = 0
            AND ${raw.sql}
          UNION
          SELECT direct_listing.source_listing_id,
                 direct_listing.id AS listing_id
          FROM listings AS direct_listing
          WHERE (direct_listing.source_id = 'ebay'
                 OR direct_listing.source_marketplace = 'ebay')
            AND direct_listing.demo_record = 0
            AND (${seller.sql})`,
    bindings: [...raw.bindings, ...seller.bindings],
  };
}

function prepared(
  db: D1Database,
  sql: string,
  bindings: Array<string | number | null>,
): D1PreparedStatement {
  return db.prepare(sql).bind(...bindings);
}

function changed(result: D1Result<unknown> | undefined) {
  return Number(result?.meta.changes ?? 0);
}

export async function deleteEbayUserData(
  db: D1Database,
  request: EbayUserDeletionRequest,
): Promise<EbayUserDeletionSummary> {
  const existing = await db
    .prepare(
      `SELECT status FROM ebay_deletion_receipts WHERE notification_id = ?`,
    )
    .bind(request.notificationId)
    .first<{ status: string }>();
  if (existing?.status === 'processed')
    return { ...EMPTY_SUMMARY, duplicate: true };

  const receivedAt = request.receivedAt ?? Date.now();
  const eventDate = Date.parse(request.eventDate);
  if (!Number.isFinite(eventDate)) throw new Error('Invalid eBay event date.');
  const fingerprints = ebaySuppressionFingerprints(
    request.hmacSecret,
    request.data,
  );
  if (!fingerprints.length)
    throw new Error('No eBay user identifier supplied.');
  const processingToken = crypto.randomUUID();
  const affectedTargets = affectedListingTargets(request.data);
  const targets = `SELECT listing_id FROM ebay_deletion_listing_targets
                   WHERE notification_id = ? AND listing_id <> ''`;
  const externalTargets = `SELECT source_listing_id FROM ebay_deletion_listing_targets
                           WHERE notification_id = ? AND source_listing_id <> ''`;
  const valuationTargets = `SELECT valuation_id FROM ebay_deletion_valuation_targets
                            WHERE notification_id = ?`;

  const statements: D1PreparedStatement[] = [
    prepared(
      db,
      `INSERT INTO ebay_deletion_receipts
        (notification_id, topic, schema_version, event_date, received_at,
         processed_at, status, counts_json, hmac_key_version, processing_token)
       VALUES (?, 'MARKETPLACE_ACCOUNT_DELETION', ?, ?, ?, NULL,
               'processing', '{}', 'v1', ?)
       ON CONFLICT(notification_id) DO UPDATE SET
         topic = excluded.topic,
         schema_version = excluded.schema_version,
         event_date = excluded.event_date,
         received_at = excluded.received_at,
         processed_at = NULL,
         status = 'processing',
         counts_json = '{}',
         hmac_key_version = excluded.hmac_key_version,
         processing_token = excluded.processing_token
       WHERE ebay_deletion_receipts.status <> 'processed'
         AND ebay_deletion_receipts.processing_token IS NULL`,
      [
        request.notificationId,
        request.schemaVersion,
        eventDate,
        receivedAt,
        processingToken,
      ],
    ),
    ...fingerprints.map(({ fingerprint, identityType }) =>
      prepared(
        db,
        `INSERT INTO ebay_suppressed_identities
          (fingerprint, identity_type, hmac_key_version, notification_id,
           created_at)
         SELECT ?, ?, 'v1', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM ebay_deletion_receipts
           WHERE notification_id = ?
             AND status = 'processing'
             AND processing_token = ?
         )
         ON CONFLICT(fingerprint) DO NOTHING`,
        [
          fingerprint,
          identityType,
          request.notificationId,
          receivedAt,
          request.notificationId,
          processingToken,
        ],
      ),
    ),
    prepared(
      db,
      `INSERT INTO ebay_deletion_listing_targets
       (notification_id, source_listing_id, listing_id)
       SELECT ?, affected.source_listing_id,
              COALESCE(affected.listing_id, '')
       FROM (${affectedTargets.sql}) AS affected
       WHERE EXISTS (
         SELECT 1 FROM ebay_deletion_receipts
         WHERE notification_id = ?
           AND status = 'processing'
           AND processing_token = ?
       )
       ON CONFLICT(notification_id, source_listing_id, listing_id) DO NOTHING`,
      [
        request.notificationId,
        ...affectedTargets.bindings,
        request.notificationId,
        processingToken,
      ],
    ),
    prepared(
      db,
      `INSERT INTO ebay_deletion_valuation_targets
        (notification_id, valuation_id)
       SELECT ?, deal_scores.valuation_id FROM deal_scores
       WHERE deal_scores.listing_id IN (${targets})
       ON CONFLICT(notification_id, valuation_id) DO NOTHING`,
      [request.notificationId, request.notificationId],
    ),
    prepared(
      db,
      `DELETE FROM community_verifications
       WHERE LOWER(COALESCE(market_source, '')) LIKE 'ebay%'
         AND (
           market_listing_id IN (${externalTargets})
           OR market_url IN (
             SELECT listings.source_listing_url FROM listings
             WHERE listings.id IN (${targets})
           )
         )`,
      [request.notificationId, request.notificationId],
    ),
    prepared(db, `DELETE FROM alerts WHERE listing_id IN (${targets})`, [
      request.notificationId,
    ]),
    prepared(
      db,
      `DELETE FROM watchlist_items WHERE listing_id IN (${targets})`,
      [request.notificationId],
    ),
    prepared(db, `DELETE FROM review_queue WHERE listing_id IN (${targets})`, [
      request.notificationId,
    ]),
    prepared(
      db,
      `DELETE FROM audit_logs
       WHERE target_id IN (${targets})
          OR target_id IN (${externalTargets})`,
      [request.notificationId, request.notificationId],
    ),
    prepared(
      db,
      `UPDATE purchases SET listing_id = NULL
       WHERE listing_id IN (${targets})`,
      [request.notificationId],
    ),
    prepared(
      db,
      `DELETE FROM community_shadow_evaluations
       WHERE shadow_trade_id IN (
         SELECT id FROM shadow_trades WHERE listing_id IN (${targets})
       )`,
      [request.notificationId],
    ),
    prepared(db, `DELETE FROM shadow_trades WHERE listing_id IN (${targets})`, [
      request.notificationId,
    ]),
    prepared(db, `DELETE FROM deal_scores WHERE listing_id IN (${targets})`, [
      request.notificationId,
    ]),
    prepared(
      db,
      `DELETE FROM valuation_snapshots
       WHERE id IN (${valuationTargets})
         AND NOT EXISTS (
           SELECT 1 FROM deal_scores
           WHERE deal_scores.valuation_id = valuation_snapshots.id
         )`,
      [request.notificationId],
    ),
    prepared(
      db,
      `DELETE FROM listing_snapshots WHERE listing_id IN (${targets})`,
      [request.notificationId],
    ),
    prepared(db, `DELETE FROM listings WHERE id IN (${targets})`, [
      request.notificationId,
    ]),
    prepared(
      db,
      `DELETE FROM source_records
       WHERE source_id = 'ebay' AND demo_record = 0
         AND source_listing_id IN (${externalTargets})`,
      [request.notificationId],
    ),
    prepared(
      db,
      `DELETE FROM ebay_deletion_valuation_targets WHERE notification_id = ?`,
      [request.notificationId],
    ),
    prepared(
      db,
      `DELETE FROM ebay_deletion_listing_targets WHERE notification_id = ?`,
      [request.notificationId],
    ),
    prepared(
      db,
      `UPDATE ebay_deletion_receipts
       SET status = 'processed', processed_at = ?
       WHERE notification_id = ?
         AND status = 'processing'
         AND processing_token = ?`,
      [Date.now(), request.notificationId, processingToken],
    ),
  ];

  const results = await db.batch(statements);
  const offset = 1 + fingerprints.length;
  if (changed(results[offset + 17]) !== 1)
    return { ...EMPTY_SUMMARY, duplicate: true };
  const summary: EbayUserDeletionSummary = {
    duplicate: false,
    communityVerifications: changed(results[offset + 2]),
    alerts: changed(results[offset + 3]),
    watchlistItems: changed(results[offset + 4]),
    reviewItems: changed(results[offset + 5]),
    auditLogs: changed(results[offset + 6]),
    purchasesDetached: changed(results[offset + 7]),
    shadowEvaluations: changed(results[offset + 8]),
    shadowTrades: changed(results[offset + 9]),
    dealScores: changed(results[offset + 10]),
    valuationSnapshots: changed(results[offset + 11]),
    listingSnapshots: changed(results[offset + 12]),
    listings: changed(results[offset + 13]),
    sourceRecords: changed(results[offset + 14]),
  };
  await db
    .prepare(
      `UPDATE ebay_deletion_receipts
       SET counts_json = ?, processing_token = NULL
       WHERE notification_id = ?
         AND status = 'processed'
         AND processing_token = ?`,
    )
    .bind(JSON.stringify(summary), request.notificationId, processingToken)
    .run();
  return summary;
}
