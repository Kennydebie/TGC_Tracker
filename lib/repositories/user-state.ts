import type { D1Database } from '@cloudflare/workers-types';

import type { Deal, DealEconomics } from '../domain.ts';
import { reviewItems } from '../fixtures.ts';
import type { RequestUser } from '../server/user.ts';

const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number | null) => (value ?? 0) / 100;

export async function ensureUser(db: D1Database, user: RequestUser) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    )
    .bind(user.id, user.email, user.displayName, now, now)
    .run();
}

export async function ensureDemoListing(
  db: D1Database,
  user: RequestUser,
  deal: Deal,
) {
  await ensureUser(db, user);
  const now = Date.now();
  const sourceId = 'fixture-market';
  const productId = `demo-product:${deal.id}`;
  const listingId = `demo-listing:${deal.id}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO sources
          (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(
        sourceId,
        'Isolated Demo Marketplace',
        'fixture',
        'Fixture',
        1,
        JSON.stringify({ checkoutAllowed: false, demoOnly: true }),
        now,
        now,
      ),
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
        `demo-${deal.id}`,
        deal.productType,
        deal.language,
        1,
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
         ON CONFLICT(id) DO UPDATE SET
           item_price_cents = excluded.item_price_cents,
           shipping_cents = excluded.shipping_cents,
           availability_status = excluded.availability_status,
           last_verified_at = excluded.last_verified_at,
           last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        listingId,
        sourceId,
        deal.sourceListingId,
        deal.sourceListingId,
        deal.sourceMarketplace,
        productId,
        deal.seller,
        deal.title,
        deal.sourceListingUrl,
        deal.sourceListingUrl,
        cents(deal.economics.itemPrice),
        cents(deal.economics.inboundShipping),
        'EUR',
        deal.quantity,
        deal.condition,
        deal.language,
        deal.matchConfidence * 100,
        'active',
        deal.availabilityStatus,
        Date.parse(deal.detectedAt),
        Date.parse(deal.lastVerifiedAt),
        Date.parse(deal.detectedAt),
        now,
        1,
      ),
  ]);
  return { listingId, productId };
}

async function ensureDefaultWatchlist(
  db: D1Database,
  user: RequestUser,
  dataMode: 'demo' | 'production',
) {
  await ensureUser(db, user);
  const id = `watchlist:${user.id}:${dataMode}`;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO watchlists (id, user_id, name, data_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
    )
    .bind(id, user.id, 'Watchtower', dataMode, now, now)
    .run();
  return id;
}

export async function listTrackedDealIds(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const result = await db
    .prepare(
      `SELECT listings.id AS listing_id
       FROM watchlist_items
       INNER JOIN listings ON listings.id = watchlist_items.listing_id
       WHERE watchlist_items.user_id = ? AND watchlist_items.data_mode = 'demo'`,
    )
    .bind(user.id)
    .all<{ listing_id: string }>();
  return result.results
    .map((row) => row.listing_id.replace(/^demo-listing:/, ''))
    .filter(Boolean);
}

export async function setTrackedDeal(
  db: D1Database,
  user: RequestUser,
  deal: Deal,
  tracked: boolean,
) {
  const { listingId, productId } = await ensureDemoListing(db, user, deal);
  const watchlistId = await ensureDefaultWatchlist(db, user, 'demo');
  if (!tracked) {
    await db
      .prepare(
        `DELETE FROM watchlist_items
         WHERE user_id = ? AND listing_id = ? AND data_mode = 'demo'`,
      )
      .bind(user.id, listingId)
      .run();
    return false;
  }
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO watchlist_items
        (id, user_id, watchlist_id, product_id, listing_id, target_all_in_cents,
         muted, data_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         target_all_in_cents = excluded.target_all_in_cents,
         muted = 0,
         updated_at = excluded.updated_at`,
    )
    .bind(
      `watch:${user.id}:${deal.id}`,
      user.id,
      watchlistId,
      productId,
      listingId,
      cents(deal.economics.maximumAllInCost),
      0,
      'demo',
      now,
      now,
    )
    .run();
  return true;
}

export type UserSettingsInput = {
  country: string;
  postcode: string;
  currency: 'EUR';
  localRadiusKm: number;
  laborRate: number;
  requiredRoi: number;
  requiredProfit: number;
};

export async function getUserSettings(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const row = await db
    .prepare(
      `SELECT country, postcode, currency, timezone, local_radius_km,
              labor_rate_cents, required_roi_bps, required_profit_cents
       FROM user_settings WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<Record<string, string | number | null>>();
  if (!row)
    return {
      country: 'NL',
      postcode: '',
      currency: 'EUR' as const,
      timezone: 'Europe/Amsterdam',
      localRadiusKm: 50,
      laborRate: 18,
      requiredRoi: 0.2,
      requiredProfit: 25,
    };
  return {
    country: String(row.country),
    postcode: String(row.postcode ?? ''),
    currency: 'EUR' as const,
    timezone: String(row.timezone),
    localRadiusKm: Number(row.local_radius_km),
    laborRate: fromCents(Number(row.labor_rate_cents)),
    requiredRoi: Number(row.required_roi_bps) / 10_000,
    requiredProfit: fromCents(Number(row.required_profit_cents)),
  };
}

export async function saveUserSettings(
  db: D1Database,
  user: RequestUser,
  input: UserSettingsInput,
) {
  await ensureUser(db, user);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user_settings
        (user_id, country, postcode, currency, timezone, local_radius_km,
         labor_rate_cents, required_roi_bps, required_profit_cents, demo_mode,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         country = excluded.country,
         postcode = excluded.postcode,
         currency = excluded.currency,
         local_radius_km = excluded.local_radius_km,
         labor_rate_cents = excluded.labor_rate_cents,
         required_roi_bps = excluded.required_roi_bps,
         required_profit_cents = excluded.required_profit_cents,
         updated_at = excluded.updated_at`,
    )
    .bind(
      user.id,
      input.country,
      input.postcode,
      input.currency,
      'Europe/Amsterdam',
      input.localRadiusKm,
      cents(input.laborRate),
      Math.round(input.requiredRoi * 10_000),
      cents(input.requiredProfit),
      1,
      now,
      now,
    )
    .run();
  return getUserSettings(db, user);
}

export type AlertRuleInput = {
  matchConfidence: number;
  minimumProfit: number;
  minimumRoi: number;
  minimumProfitPerHour: number;
  minimumGrade: string;
  maximumHoldingDays: number;
  maximumRiskScore: number;
};

export async function getAlertRule(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const row = await db
    .prepare(
      `SELECT match_confidence_bps, minimum_profit_cents, minimum_roi_bps,
              minimum_profit_per_hour_cents, minimum_grade,
              maximum_holding_days, maximum_risk_score
       FROM alert_rules
       WHERE user_id = ? AND data_mode = 'demo' AND enabled = 1
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(user.id)
    .first<Record<string, string | number>>();
  if (!row)
    return {
      matchConfidence: 90,
      minimumProfit: 25,
      minimumRoi: 0.2,
      minimumProfitPerHour: 20,
      minimumGrade: 'B',
      maximumHoldingDays: 90,
      maximumRiskScore: 59,
    };
  return {
    matchConfidence: Number(row.match_confidence_bps) / 100,
    minimumProfit: fromCents(Number(row.minimum_profit_cents)),
    minimumRoi: Number(row.minimum_roi_bps) / 10_000,
    minimumProfitPerHour: fromCents(Number(row.minimum_profit_per_hour_cents)),
    minimumGrade: String(row.minimum_grade),
    maximumHoldingDays: Number(row.maximum_holding_days),
    maximumRiskScore: Number(row.maximum_risk_score),
  };
}

export async function saveAlertRule(
  db: D1Database,
  user: RequestUser,
  input: AlertRuleInput,
) {
  await ensureUser(db, user);
  const now = Date.now();
  const id = `alert-rule:${user.id}:demo`;
  await db
    .prepare(
      `INSERT INTO alert_rules
        (id, user_id, name, enabled, match_confidence_bps,
         minimum_profit_cents, minimum_roi_bps,
         minimum_profit_per_hour_cents, minimum_grade,
         maximum_holding_days, maximum_risk_score, data_mode,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         match_confidence_bps = excluded.match_confidence_bps,
         minimum_profit_cents = excluded.minimum_profit_cents,
         minimum_roi_bps = excluded.minimum_roi_bps,
         minimum_profit_per_hour_cents = excluded.minimum_profit_per_hour_cents,
         minimum_grade = excluded.minimum_grade,
         maximum_holding_days = excluded.maximum_holding_days,
         maximum_risk_score = excluded.maximum_risk_score,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      user.id,
      'Quick flip gate',
      1,
      Math.round(input.matchConfidence * 100),
      cents(input.minimumProfit),
      Math.round(input.minimumRoi * 10_000),
      cents(input.minimumProfitPerHour),
      input.minimumGrade,
      input.maximumHoldingDays,
      input.maximumRiskScore,
      'demo',
      now,
      now,
    )
    .run();
  return getAlertRule(db, user);
}

export async function createShadowTrade(
  db: D1Database,
  user: RequestUser,
  deal: Deal,
) {
  const { listingId } = await ensureDemoListing(db, user, deal);
  const now = Date.now();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO shadow_trades
        (id, user_id, listing_id, detected_price_cents,
         executable_price_cents, predicted_profit_cents, economics_json,
         model_version, later_supported_profit_cents, status, data_mode,
         next_follow_up_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.id,
      listingId,
      cents(deal.economics.itemPrice),
      cents(deal.economics.itemPrice),
      cents(deal.economics.conservativeProfit),
      JSON.stringify(deal.economics),
      deal.economics.modelVersion,
      null,
      'open',
      'demo',
      now + 7 * 86_400_000,
      now,
    )
    .run();
  return {
    id,
    dealId: deal.id,
    name: deal.canonicalProduct,
    detected: new Date(now).toISOString(),
    economics: deal.economics,
    laterSupportedNetExit: null,
    status: 'Open',
    followUp: '7-day due',
    dataMode: 'demo' as const,
  };
}

export async function listShadowTrades(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const result = await db
    .prepare(
      `SELECT shadow_trades.id, shadow_trades.listing_id,
              shadow_trades.created_at, shadow_trades.economics_json,
              shadow_trades.later_supported_profit_cents,
              shadow_trades.status, shadow_trades.next_follow_up_at,
              products.name
       FROM shadow_trades
       INNER JOIN listings ON listings.id = shadow_trades.listing_id
       INNER JOIN products ON products.id = listings.product_id
       WHERE shadow_trades.user_id = ? AND shadow_trades.data_mode = 'demo'
       ORDER BY shadow_trades.created_at DESC`,
    )
    .bind(user.id)
    .all<Record<string, string | number | null>>();
  return result.results.map((row) => ({
    id: String(row.id),
    dealId: String(row.listing_id).replace(/^demo-listing:/, ''),
    name: String(row.name),
    detected: new Date(Number(row.created_at)).toISOString(),
    economics: JSON.parse(String(row.economics_json)) as DealEconomics,
    laterSupportedNetExit:
      row.later_supported_profit_cents == null
        ? null
        : fromCents(Number(row.later_supported_profit_cents)) +
          (JSON.parse(String(row.economics_json)) as DealEconomics).allInCost,
    status: String(row.status),
    followUp: new Date(Number(row.next_follow_up_at)).toISOString(),
    dataMode: 'demo' as const,
  }));
}

export async function seedDemoReviewItems(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const now = Date.now();
  const statements = reviewItems.map((item, index) =>
    db
      .prepare(
        `INSERT INTO review_queue
          (id, user_id, source_id, listing_id, kind, severity, payload_json,
           status, data_mode, resolved_by, resolved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        `demo-review:${user.id}:${item.id}`,
        user.id,
        null,
        null,
        item.type,
        item.severity,
        JSON.stringify({ ...item, id: `demo-review:${user.id}:${item.id}` }),
        'open',
        'demo',
        null,
        null,
        now - index * 60_000,
      ),
  );
  if (statements.length) await db.batch(statements);
}

export async function listReviewItems(db: D1Database, user: RequestUser) {
  await seedDemoReviewItems(db, user);
  const result = await db
    .prepare(
      `SELECT id, payload_json FROM review_queue
       WHERE user_id = ? AND status = 'open'
       ORDER BY created_at ASC`,
    )
    .bind(user.id)
    .all<{ id: string; payload_json: string }>();
  return result.results.map((row) => ({
    ...(JSON.parse(row.payload_json) as Record<string, unknown>),
    id: row.id,
  }));
}

export const REVIEW_RESOLUTIONS = new Set([
  'accept_candidate',
  'select_alternative',
  'edit_fields',
  'packaging_only',
  'duplicate',
  'reject_listing',
  'defer',
]);

export async function resolveReviewItem(
  db: D1Database,
  user: RequestUser,
  id: string,
  resolution: string,
  details: Record<string, unknown>,
) {
  if (!REVIEW_RESOLUTIONS.has(resolution))
    throw new Error('A valid review resolution is required');
  await ensureUser(db, user);
  if (resolution === 'defer')
    return { id, status: 'open', resolution, resolvedAt: null };
  const resolvedAt = Date.now();
  const result = await db
    .prepare(
      `UPDATE review_queue
       SET status = 'resolved', resolved_by = ?, resolved_at = ?,
           payload_json = json_set(payload_json, '$.resolution', ?, '$.resolutionDetails', json(?))
       WHERE id = ? AND user_id = ? AND status = 'open'`,
    )
    .bind(user.id, resolvedAt, resolution, JSON.stringify(details), id, user.id)
    .run();
  if (!result.meta.changes) throw new Error('Review item was not found');
  return {
    id,
    status: 'resolved',
    resolution,
    resolvedAt: new Date(resolvedAt).toISOString(),
  };
}

export type PurchaseInput = {
  deal: Deal;
  quantity: number;
  itemPrice: number;
  acquisitionCosts: number;
  strategy: string;
};

export async function createPurchase(
  db: D1Database,
  user: RequestUser,
  input: PurchaseInput,
) {
  const { listingId, productId } = await ensureDemoListing(
    db,
    user,
    input.deal,
  );
  const now = Date.now();
  const inventoryLotId = crypto.randomUUID();
  const purchaseId = crypto.randomUUID();
  const allInCost = input.itemPrice + input.acquisitionCosts;
  await db.batch([
    db
      .prepare(
        `INSERT INTO inventory_lots
          (id, user_id, product_id, quantity, remaining_quantity, acquired_at,
           item_price_cents, all_in_basis_cents, currency, historical_fx_rate,
           strategy, storage_location, data_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        inventoryLotId,
        user.id,
        productId,
        input.quantity,
        input.quantity,
        now,
        cents(input.itemPrice),
        cents(allInCost),
        'EUR',
        1,
        input.strategy,
        null,
        'demo',
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO purchases
          (id, user_id, listing_id, product_id, inventory_lot_id, quantity,
           purchased_at, item_price_cents, acquisition_costs_cents,
           all_in_cost_cents, currency, data_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        purchaseId,
        user.id,
        listingId,
        productId,
        inventoryLotId,
        input.quantity,
        now,
        cents(input.itemPrice),
        cents(input.acquisitionCosts),
        cents(allInCost),
        'EUR',
        'demo',
        now,
        now,
      ),
  ]);
  return {
    id: purchaseId,
    inventoryLotId,
    quantity: input.quantity,
    allInCost,
    purchasedAt: new Date(now).toISOString(),
  };
}

export async function listInventoryLots(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const result = await db
    .prepare(
      `SELECT inventory_lots.id, inventory_lots.quantity,
              inventory_lots.remaining_quantity, inventory_lots.acquired_at,
              inventory_lots.all_in_basis_cents, inventory_lots.strategy,
              products.name
       FROM inventory_lots
       INNER JOIN products ON products.id = inventory_lots.product_id
       WHERE inventory_lots.user_id = ? AND inventory_lots.data_mode = 'demo'
       ORDER BY inventory_lots.acquired_at DESC`,
    )
    .bind(user.id)
    .all<Record<string, string | number>>();
  return result.results.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
    remainingQuantity: Number(row.remaining_quantity),
    acquiredAt: new Date(Number(row.acquired_at)).toISOString(),
    allInBasis: fromCents(Number(row.all_in_basis_cents)),
    strategy: String(row.strategy),
    dataMode: 'demo' as const,
  }));
}

export async function createSale(
  db: D1Database,
  user: RequestUser,
  input: {
    inventoryLotId: string;
    quantity: number;
    venue: string;
    gross: number;
    costs: number;
  },
) {
  await ensureUser(db, user);
  const lot = await db
    .prepare(
      `SELECT remaining_quantity, quantity, all_in_basis_cents
       FROM inventory_lots
       WHERE id = ? AND user_id = ? AND data_mode = 'demo'`,
    )
    .bind(input.inventoryLotId, user.id)
    .first<{
      remaining_quantity: number;
      quantity: number;
      all_in_basis_cents: number;
    }>();
  if (!lot) throw new Error('Inventory lot was not found');
  if (input.quantity > lot.remaining_quantity)
    throw new Error('Sale quantity exceeds remaining inventory');
  const netProceeds = input.gross - input.costs;
  const allocatedBasis =
    (fromCents(lot.all_in_basis_cents) / lot.quantity) * input.quantity;
  const realisedProfit = netProceeds - allocatedBasis;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE inventory_lots
         SET remaining_quantity = remaining_quantity - ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(input.quantity, now, input.inventoryLotId, user.id),
    db
      .prepare(
        `INSERT INTO sales
          (id, user_id, inventory_lot_id, quantity, sold_at, venue,
           gross_cents, total_costs_cents, net_proceeds_cents,
           realised_profit_cents, currency, data_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        input.inventoryLotId,
        input.quantity,
        now,
        input.venue,
        cents(input.gross),
        cents(input.costs),
        cents(netProceeds),
        cents(realisedProfit),
        'EUR',
        'demo',
        now,
        now,
      ),
  ]);
  return {
    id,
    quantity: input.quantity,
    netProceeds,
    realisedProfit,
    soldAt: new Date(now).toISOString(),
  };
}

export async function listAlerts(db: D1Database, user: RequestUser) {
  await ensureUser(db, user);
  const result = await db
    .prepare(
      `SELECT id, priority, kind, payload_json, read_at, created_at
       FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(user.id)
    .all<Record<string, string | number | null>>();
  return result.results.map((row) => ({
    id: String(row.id),
    priority: String(row.priority),
    kind: String(row.kind),
    payload: JSON.parse(String(row.payload_json)),
    readAt: row.read_at ? new Date(Number(row.read_at)).toISOString() : null,
    createdAt: new Date(Number(row.created_at)).toISOString(),
  }));
}
