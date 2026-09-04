-- Demo-only seed. Apply only to a disposable local database.
-- Every fixture row is explicitly marked and must never share a production database.
INSERT INTO users (id, email, display_name, created_at, updated_at)
VALUES ('demo-user', 'scout@example.invalid', 'Demo Scout', 1788501600000, 1788501600000);

INSERT INTO user_settings (user_id, country, postcode, currency, timezone, local_radius_km, labor_rate_cents, required_roi_bps, required_profit_cents, demo_mode, created_at, updated_at)
VALUES ('demo-user', 'NL', '3511', 'EUR', 'Europe/Amsterdam', 100, 1800, 2000, 2500, true, 1788501600000, 1788501600000);

INSERT INTO sources (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
VALUES
  ('fixture-market', 'Isolated Demo Marketplace', 'fixture', 'fixture', true, '{"externalRequests":false,"checkout":false}', 1788501600000, 1788501600000),
  ('ebay', 'eBay Browse', 'official_api', 'disabled', false, '{"requiresCredentials":true,"activeAsksOnly":true}', 1788501600000, 1788501600000),
  ('cardmarket-public', 'Cardmarket Public Data', 'public_file', 'disabled', false, '{"dailyReference":true}', 1788501600000, 1788501600000);

INSERT INTO products (id, game, set_name, name, slug, product_type, language, manually_verified, created_at, updated_at)
VALUES
  ('prod-pe-etb', 'Pokémon', 'Prismatic Evolutions', 'Prismatic Evolutions Elite Trainer Box', 'pokemon-prismatic-evolutions-etb-en', 'elite_trainer_box', 'English', true, 1788501600000, 1788501600000),
  ('prod-rfb-origins', 'Riftbound', 'Origins', 'Origins Booster Display', 'riftbound-origins-booster-display-en', 'display', 'English', true, 1788501600000, 1788501600000);

INSERT INTO listings (id, source_id, external_id, product_id, seller_name, title, url, item_price_cents, shipping_cents, currency, quantity, condition, language, match_confidence_bps, status, first_seen_at, last_seen_at, demo_record)
VALUES
  ('listing-pe-pair', 'fixture-market', 'fx-001', 'prod-pe-etb', 'Cardzolder88', '2x Prismatic Evolutions ETB — ophalen of verzenden', 'https://demo.invalid/listing/fx-001', 11800, 695, 'EUR', 2, 'sealed', 'English', 9700, 'active', 1788501600000, 1788501600000, true),
  ('listing-rfb', 'fixture-market', 'fx-002', 'prod-rfb-origins', 'Card Corner EU', 'Riftbound Origins booster display — sealed', 'https://demo.invalid/listing/fx-002', 13900, 800, 'EUR', 1, 'sealed', 'English', 9600, 'active', 1788501600000, 1788501600000, true);
