import { deals } from '../fixtures.ts';
import { confidenceGrade, type Deal, type DealEconomics } from '../domain.ts';
import {
  conservativeEconomicsForOffer,
  type MatchedOffer,
  type ScanSummary,
} from '../services/scanning.ts';

const cents = (value: number) => Math.round(value * 100);

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function scoreEconomics(record: MatchedOffer): {
  deal: Deal;
  economics: DealEconomics;
  dataMode: 'demo' | 'production';
} | null {
  if (!record.dealId || record.rejectedReason) return null;
  const deal = deals.find((item) => item.id === record.dealId);
  if (!deal) return null;
  const dataMode =
    record.offer.sourceMarketplace === 'fixture-market'
      ? ('demo' as const)
      : ('production' as const);
  return {
    deal,
    economics:
      dataMode === 'demo'
        ? deal.economics
        : conservativeEconomicsForOffer(record.offer),
    dataMode,
  };
}

export async function persistScanSummary(db: D1Database, summary: ScanSummary) {
  for (const connector of summary.connectors) {
    const now = Date.parse(summary.finishedAt);
    const demoRecord = connector.source === 'fixture-market' ? 1 : 0;
    await db.batch([
      db
        .prepare(
          `INSERT INTO sources
            (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             enabled = excluded.enabled, mode = excluded.mode,
             policy_json = excluded.policy_json, updated_at = excluded.updated_at`,
        )
        .bind(
          connector.source,
          connector.source === 'ebay' ? 'eBay Browse' : 'Demo Marketplace',
          connector.source === 'ebay' ? 'official_api' : 'fixture',
          demoRecord ? 'Fixture' : 'Live',
          1,
          JSON.stringify({ checkoutAllowed: false }),
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO scan_runs
            (id, source_id, status, started_at, finished_at, records_fetched,
             records_normalised, matches, unmatched, alerts, error_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          `${summary.jobId}:${connector.source}`,
          connector.source,
          connector.errors.length ? 'partial' : 'completed',
          Date.parse(summary.startedAt),
          now,
          connector.fetched,
          connector.normalised,
          connector.matched,
          connector.rejected,
          connector.alerted,
          connector.errors[0] ?? null,
        ),
    ]);

    for (const record of connector.records) {
      const rawJson = JSON.stringify(record.raw.payload);
      const payloadHash = await sha256(rawJson);
      await db
        .prepare(
          `INSERT INTO source_records
            (id, source_id, source_listing_id, payload_json, payload_hash,
             captured_at, demo_record)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_id, payload_hash) DO NOTHING`,
        )
        .bind(
          `source-record:${connector.source}:${payloadHash}`,
          connector.source,
          record.offer.sourceListingId,
          rawJson,
          payloadHash,
          Date.parse(record.raw.capturedAt),
          demoRecord,
        )
        .run();

      const scored = scoreEconomics(record);
      if (!scored) continue;
      const { deal, economics, dataMode } = scored;
      const productId = `canonical:${deal.id}`;
      const listingId = `listing:${connector.source}:${record.offer.sourceListingId}`;
      const valuationId = `valuation:${listingId}:${payloadHash}`;
      const dealScoreId = `score:${listingId}:${payloadHash}`;
      const snapshotHash = await sha256(
        JSON.stringify({
          itemPrice: record.offer.itemPrice,
          shipping: record.offer.shipping,
          availabilityStatus: record.offer.availabilityStatus,
        }),
      );
      const grade =
        dataMode === 'demo'
          ? deal.confidenceGrade
          : confidenceGrade(record.matchConfidence, 1);
      const riskScore = dataMode === 'demo' ? deal.riskScore : 85;
      const instantScore = dataMode === 'demo' ? deal.instantScore : 12;
      await db.batch([
        db
          .prepare(
            `INSERT INTO products
              (id, game, set_name, name, slug, product_type, language,
               manually_verified, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
          )
          .bind(
            productId,
            deal.game,
            deal.set,
            deal.canonicalProduct,
            `canonical-${deal.id}`,
            deal.productType,
            deal.language,
            0,
            now,
            now,
          ),
        db
          .prepare(
            `INSERT INTO listings
              (id, source_id, external_id, source_listing_id, source_marketplace,
               product_id, seller_name, title, url, source_listing_url,
               item_price_cents, shipping_cents, currency, quantity, condition,
               language, match_confidence_bps, status, availability_status,
               detected_at, last_verified_at, first_seen_at, last_seen_at, demo_record)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_id, external_id) DO UPDATE SET
               product_id = excluded.product_id,
               seller_name = excluded.seller_name,
               title = excluded.title,
               source_listing_url = excluded.source_listing_url,
               url = excluded.url,
               item_price_cents = excluded.item_price_cents,
               shipping_cents = excluded.shipping_cents,
               quantity = excluded.quantity,
               condition = excluded.condition,
               language = excluded.language,
               match_confidence_bps = excluded.match_confidence_bps,
               status = excluded.status,
               availability_status = excluded.availability_status,
               last_verified_at = excluded.last_verified_at,
               last_seen_at = excluded.last_seen_at`,
          )
          .bind(
            listingId,
            connector.source,
            record.offer.externalId,
            record.offer.sourceListingId,
            record.offer.sourceMarketplace,
            productId,
            record.offer.seller,
            record.offer.title,
            record.offer.sourceListingUrl,
            record.offer.sourceListingUrl,
            cents(record.offer.itemPrice),
            cents(record.offer.shipping ?? 0),
            record.offer.currency,
            record.offer.quantity,
            record.offer.condition,
            record.offer.language,
            record.matchConfidence * 100,
            record.offer.available ? 'active' : 'inactive',
            record.offer.availabilityStatus,
            Date.parse(record.offer.detectedAt),
            Date.parse(record.offer.lastVerifiedAt),
            Date.parse(record.offer.detectedAt),
            Date.parse(record.offer.lastVerifiedAt),
            demoRecord,
          ),
        db
          .prepare(
            `INSERT INTO listing_snapshots
              (id, listing_id, item_price_cents, shipping_cents, currency,
               availability_status, content_hash, observed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(listing_id, content_hash) DO UPDATE SET
               observed_at = excluded.observed_at`,
          )
          .bind(
            `snapshot:${listingId}:${snapshotHash}`,
            listingId,
            cents(record.offer.itemPrice),
            cents(record.offer.shipping ?? 0),
            record.offer.currency,
            record.offer.availabilityStatus,
            snapshotHash,
            Date.parse(record.offer.lastVerifiedAt),
          ),
        db
          .prepare(
            `INSERT INTO valuation_snapshots
              (id, product_id, conservative_cents, fair_value_cents,
               optimistic_cents, confidence_grade, observation_count,
               assumptions_json, model_version, valued_at, demo_record)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            valuationId,
            productId,
            cents(economics.conservativeNetExit),
            dataMode === 'demo' ? cents(economics.expectedSalePrice) : null,
            null,
            grade,
            dataMode === 'demo' ? Math.max(1, deal.soldCount30d ?? 1) : 0,
            JSON.stringify({
              dataMode,
              activeAskIsNotSaleEvidence: true,
              note:
                dataMode === 'demo'
                  ? 'Fictional demonstration transaction evidence.'
                  : 'No completed-sale evidence stored; exit value held at zero.',
            }),
            economics.modelVersion,
            now,
            demoRecord,
          ),
        db
          .prepare(
            `INSERT INTO deal_scores
              (id, listing_id, valuation_id, instant_score, hold_score,
               risk_score, confidence_grade, all_in_cost_cents,
               conservative_net_exit_cents, expected_profit_cents, roi_bps,
               profit_per_hour_cents, maximum_item_price_cents,
               maximum_all_in_cost_cents, preferred_exit, explanation_json,
               model_version, scored_at, demo_record)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            dealScoreId,
            listingId,
            valuationId,
            instantScore,
            dataMode === 'demo' ? deal.holdScore : 0,
            riskScore,
            grade,
            cents(economics.allInCost),
            cents(economics.conservativeNetExit),
            cents(economics.conservativeProfit),
            Math.round(economics.roi * 10_000),
            cents(economics.profitPerHour),
            cents(economics.maximumItemPrice),
            cents(economics.maximumAllInCost),
            dataMode === 'demo' ? deal.exitChannel : 'No supported exit',
            JSON.stringify({
              economics,
              priceEvidence:
                dataMode === 'demo'
                  ? deal.priceEvidence
                  : 'Observed active listing only; no completed-sale evidence stored.',
              sourceDealId: deal.id,
            }),
            economics.modelVersion,
            now,
            demoRecord,
          ),
      ]);
    }
  }
}

export async function listProductionDeals(db: D1Database): Promise<Deal[]> {
  const result = await db
    .prepare(
      `SELECT listings.id, listings.title, listings.seller_name,
              listings.source_listing_url, listings.source_listing_id,
              listings.source_marketplace, listings.last_verified_at,
              listings.availability_status, listings.detected_at,
              listings.condition, listings.language, listings.quantity,
              listings.match_confidence_bps, sources.name AS source_name,
              products.name AS product_name, products.game, products.set_name,
              products.product_type, deal_scores.instant_score,
              deal_scores.hold_score, deal_scores.risk_score,
              deal_scores.confidence_grade, deal_scores.preferred_exit,
              deal_scores.explanation_json
       FROM listings
       INNER JOIN sources ON sources.id = listings.source_id
       INNER JOIN products ON products.id = listings.product_id
       INNER JOIN deal_scores ON deal_scores.id = (
         SELECT candidate.id FROM deal_scores AS candidate
         WHERE candidate.listing_id = listings.id
         ORDER BY candidate.scored_at DESC LIMIT 1
       )
       WHERE listings.demo_record = 0
       ORDER BY listings.last_seen_at DESC LIMIT 100`,
    )
    .all<Record<string, string | number | null>>();
  const now = Date.now();
  return result.results.map((row) => {
    const explanation = JSON.parse(String(row.explanation_json)) as {
      economics: DealEconomics;
      priceEvidence: string;
    };
    const detectedAt = Number(row.detected_at);
    const minutes = Math.max(0, Math.round((now - detectedAt) / 60_000));
    return {
      id: String(row.id),
      title: String(row.title),
      canonicalProduct: String(row.product_name),
      game: String(row.game) as Deal['game'],
      set: String(row.set_name),
      productType: String(row.product_type),
      source: String(row.source_name),
      dataMode: 'production',
      sourceListingUrl: String(row.source_listing_url),
      sourceListingId: String(row.source_listing_id),
      sourceMarketplace: String(row.source_marketplace),
      lastVerifiedAt: new Date(Number(row.last_verified_at)).toISOString(),
      availabilityStatus: String(
        row.availability_status,
      ) as Deal['availabilityStatus'],
      detectedAt: new Date(detectedAt).toISOString(),
      location: 'Marketplace listing',
      language: String(row.language ?? 'Unknown'),
      condition: String(row.condition ?? 'Unknown'),
      quantity: Number(row.quantity ?? 1),
      seller: String(row.seller_name ?? 'Unknown seller'),
      sellerScore: 0,
      listingAge:
        minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`,
      detectedMinutesAgo: minutes,
      matchConfidence: Number(row.match_confidence_bps ?? 0) / 100,
      confidenceGrade: String(row.confidence_grade) as Deal['confidenceGrade'],
      liquidity: 'Unknown',
      soldCount30d: null,
      activeListings: null,
      medianDaysToSell: null,
      instantScore: Number(row.instant_score),
      holdScore: Number(row.hold_score),
      riskScore: Number(row.risk_score),
      status: 'Speculative',
      exitChannel: String(row.preferred_exit),
      priceEvidence: explanation.priceEvidence,
      risks: ['No completed-sale evidence stored for this live listing'],
      catalysts: [],
      tags: ['Live source', 'Active ask only'],
      tint: 'blue',
      tracked: false,
      economics: explanation.economics,
    };
  });
}
