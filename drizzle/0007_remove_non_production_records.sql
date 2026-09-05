-- Remove historical non-production records after all runtime fixture paths have
-- been disabled. Canonical product identities are intentionally retained because
-- production marketplace records can share them.

UPDATE user_settings SET demo_mode = 0 WHERE demo_mode <> 0;

DELETE FROM alert_rules WHERE data_mode <> 'production';

-- Remove the legacy local seed identity after clearing the two relations that do
-- not cascade from users. All other user-owned seed rows cascade automatically.
DELETE FROM audit_logs WHERE user_id = 'demo-user';
DELETE FROM review_queue
WHERE user_id = 'demo-user' OR resolved_by = 'demo-user';
DELETE FROM users WHERE id = 'demo-user';

DELETE FROM community_shadow_evaluations
WHERE data_mode <> 'production'
   OR shadow_trade_id IN (
     SELECT id FROM shadow_trades WHERE data_mode <> 'production'
   )
   OR community_event_id IN (
     SELECT id FROM community_signal_events WHERE data_mode <> 'production'
   );

DELETE FROM community_lead_time
WHERE verification_id IN (
  SELECT id FROM community_verifications WHERE data_mode <> 'production'
)
OR source_id IN (
  SELECT id FROM community_sources WHERE data_mode <> 'production'
);

DELETE FROM community_verifications
WHERE data_mode <> 'production'
   OR event_id IN (
     SELECT id FROM community_signal_events WHERE data_mode <> 'production'
   );

DELETE FROM community_hype_metrics
WHERE event_id IN (
  SELECT id FROM community_signal_events WHERE data_mode <> 'production'
);

DELETE FROM community_event_signals
WHERE event_id IN (
  SELECT id FROM community_signal_events WHERE data_mode <> 'production'
)
OR signal_id IN (
  SELECT id FROM community_signals WHERE data_mode <> 'production'
);

DELETE FROM community_product_momentum WHERE data_mode <> 'production';
DELETE FROM community_signal_events WHERE data_mode <> 'production';
DELETE FROM community_signal_entities
WHERE signal_id IN (
  SELECT id FROM community_signals WHERE data_mode <> 'production'
);
DELETE FROM community_signals WHERE data_mode <> 'production';
DELETE FROM community_source_reliability
WHERE source_id IN (
  SELECT id FROM community_sources WHERE data_mode <> 'production'
);
DELETE FROM community_source_configs
WHERE source_id IN (
  SELECT id FROM community_sources WHERE data_mode <> 'production'
);
DELETE FROM community_sources WHERE data_mode <> 'production';

DELETE FROM review_queue
WHERE data_mode <> 'production'
   OR listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);

DELETE FROM alerts
WHERE listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);

DELETE FROM sales
WHERE data_mode <> 'production'
   OR inventory_lot_id IN (
     SELECT id FROM inventory_lots WHERE data_mode <> 'production'
   );
DELETE FROM purchases
WHERE data_mode <> 'production'
   OR listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);
DELETE FROM inventory_lots WHERE data_mode <> 'production';

DELETE FROM watchlist_items
WHERE data_mode <> 'production'
   OR listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);
DELETE FROM watchlists WHERE data_mode <> 'production';

DELETE FROM community_shadow_evaluations
WHERE shadow_trade_id IN (
  SELECT shadow_trades.id
  FROM shadow_trades
  INNER JOIN listings ON listings.id = shadow_trades.listing_id
  WHERE listings.demo_record <> 0
);
DELETE FROM shadow_trades
WHERE data_mode <> 'production'
   OR listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);

DELETE FROM deal_scores
WHERE demo_record <> 0
   OR listing_id IN (SELECT id FROM listings WHERE demo_record <> 0)
   OR valuation_id IN (
     SELECT id FROM valuation_snapshots WHERE demo_record <> 0
   );
DELETE FROM price_observations WHERE demo_record <> 0;
DELETE FROM valuation_snapshots WHERE demo_record <> 0;

DELETE FROM amazon_price_events
WHERE demo_record <> 0
   OR amazon_product_id IN (
     SELECT id FROM amazon_marketplace_products WHERE demo_record <> 0
   );
DELETE FROM amazon_snapshots
WHERE demo_record <> 0
   OR amazon_product_id IN (
     SELECT id FROM amazon_marketplace_products WHERE demo_record <> 0
   );
DELETE FROM amazon_seller_count_history
WHERE amazon_product_id IN (
  SELECT id FROM amazon_marketplace_products WHERE demo_record <> 0
);
DELETE FROM amazon_marketplace_products WHERE demo_record <> 0;
DELETE FROM keepa_usage
WHERE scan_run_id IN (
  SELECT id FROM amazon_scan_runs WHERE mode IN ('demo', 'fixture')
);
DELETE FROM amazon_scan_runs WHERE mode IN ('demo', 'fixture');

DELETE FROM listing_snapshots
WHERE listing_id IN (SELECT id FROM listings WHERE demo_record <> 0);
DELETE FROM source_records
WHERE demo_record <> 0 OR source_id = 'fixture-market';
DELETE FROM scan_runs WHERE source_id = 'fixture-market';
DELETE FROM listings
WHERE demo_record <> 0 OR source_id = 'fixture-market';
DELETE FROM sources WHERE id = 'fixture-market' OR mode = 'Fixture';

-- These IDs came only from the removed local demo seed. Delete them when no
-- surviving production relation uses the identity.
DELETE FROM products
WHERE (
    id IN ('prod-pe-etb', 'prod-rfb-origins')
    OR id LIKE 'demo-product:%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM listings WHERE listings.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM price_observations
    WHERE price_observations.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM valuation_snapshots
    WHERE valuation_snapshots.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM watchlist_items
    WHERE watchlist_items.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM alerts WHERE alerts.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM inventory_lots
    WHERE inventory_lots.product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM amazon_marketplace_products
    WHERE amazon_marketplace_products.canonical_product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM community_signals
    WHERE community_signals.canonical_product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM community_signal_events
    WHERE community_signal_events.canonical_product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM community_product_momentum
    WHERE community_product_momentum.canonical_product_id = products.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM community_watch_rules
    WHERE community_watch_rules.canonical_product_id = products.id
  );
