CREATE TABLE `amazon_marketplace_products` (
	`id` text PRIMARY KEY NOT NULL,
	`asin` text NOT NULL,
	`marketplace` text NOT NULL,
	`provider` text DEFAULT 'amazon_keepa' NOT NULL,
	`canonical_product_id` text,
	`ean` text,
	`gtin` text,
	`manufacturer_sku` text,
	`title` text NOT NULL,
	`brand` text,
	`manufacturer` text,
	`product_group` text,
	`package_quantity` integer,
	`product_language` text,
	`match_confidence_bps` integer,
	`match_method` text,
	`mapping_json` text DEFAULT '{}' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`demo_record` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_amazon_product_market_asin` ON `amazon_marketplace_products` (`marketplace`,`asin`);--> statement-breakpoint
CREATE INDEX `idx_amazon_product_canonical` ON `amazon_marketplace_products` (`canonical_product_id`);--> statement-breakpoint
CREATE TABLE `amazon_price_events` (
	`id` text PRIMARY KEY NOT NULL,
	`amazon_product_id` text NOT NULL,
	`kind` text NOT NULL,
	`previous_value` text,
	`current_value` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` integer NOT NULL,
	`demo_record` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`amazon_product_id`) REFERENCES `amazon_marketplace_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_amazon_events_product_time` ON `amazon_price_events` (`amazon_product_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_amazon_events_kind_time` ON `amazon_price_events` (`kind`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `amazon_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`marketplaces_json` text NOT NULL,
	`products_checked` integer DEFAULT 0 NOT NULL,
	`price_changes` integer DEFAULT 0 NOT NULL,
	`new_products` integer DEFAULT 0 NOT NULL,
	`qualified` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`reason` text
);
--> statement-breakpoint
CREATE INDEX `idx_amazon_runs_mode_time` ON `amazon_scan_runs` (`mode`,`started_at`);--> statement-breakpoint
CREATE TABLE `amazon_seller_count_history` (
	`id` text PRIMARY KEY NOT NULL,
	`amazon_product_id` text NOT NULL,
	`seller_count` integer,
	`offer_count` integer,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`amazon_product_id`) REFERENCES `amazon_marketplace_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_amazon_sellers_product_time` ON `amazon_seller_count_history` (`amazon_product_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `amazon_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`amazon_product_id` text NOT NULL,
	`source_updated_at` integer,
	`fetched_at` integer NOT NULL,
	`current_price_cents` integer,
	`shipping_cents` integer,
	`shipping_status` text NOT NULL,
	`delivered_price_cents` integer,
	`buy_box_price_cents` integer,
	`amazon_price_cents` integer,
	`lowest_new_cents` integer,
	`seller_type` text NOT NULL,
	`seller_name` text,
	`seller_count` integer,
	`offer_count` integer,
	`availability` text NOT NULL,
	`offer_freshness` text NOT NULL,
	`content_hash` text NOT NULL,
	`raw_json` text NOT NULL,
	`demo_record` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`amazon_product_id`) REFERENCES `amazon_marketplace_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_amazon_snapshots_product_hash` ON `amazon_snapshots` (`amazon_product_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_amazon_snapshots_product_time` ON `amazon_snapshots` (`amazon_product_id`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `amazon_watch_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_product_id` text,
	`asin` text,
	`marketplace` text,
	`game` text,
	`set_name` text,
	`rule_type` text NOT NULL,
	`threshold_json` text NOT NULL,
	`source_url` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_amazon_watch_user_active` ON `amazon_watch_rules` (`user_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_amazon_watch_asin_market` ON `amazon_watch_rules` (`asin`,`marketplace`);--> statement-breakpoint
CREATE TABLE `keepa_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_run_id` text,
	`tokens_available` integer,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`refill_rate` integer,
	`refill_in_ms` integer,
	`skipped_requests` integer DEFAULT 0 NOT NULL,
	`next_safe_scan_at` integer,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`scan_run_id`) REFERENCES `amazon_scan_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_keepa_usage_time` ON `keepa_usage` (`captured_at`);