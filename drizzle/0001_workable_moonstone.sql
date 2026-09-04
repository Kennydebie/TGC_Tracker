CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`match_confidence_bps` integer DEFAULT 9000 NOT NULL,
	`minimum_profit_cents` integer DEFAULT 2500 NOT NULL,
	`minimum_roi_bps` integer DEFAULT 2000 NOT NULL,
	`minimum_profit_per_hour_cents` integer DEFAULT 2000 NOT NULL,
	`minimum_grade` text DEFAULT 'B' NOT NULL,
	`maximum_holding_days` integer DEFAULT 90 NOT NULL,
	`maximum_risk_score` integer DEFAULT 59 NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_alert_rules_user` ON `alert_rules` (`user_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `listing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`item_price_cents` integer NOT NULL,
	`shipping_cents` integer,
	`currency` text NOT NULL,
	`availability_status` text NOT NULL,
	`content_hash` text NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_listing_snapshots_listing_hash` ON `listing_snapshots` (`listing_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_listing_snapshots_listing_time` ON `listing_snapshots` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text,
	`product_id` text NOT NULL,
	`inventory_lot_id` text,
	`quantity` integer NOT NULL,
	`purchased_at` integer NOT NULL,
	`item_price_cents` integer NOT NULL,
	`acquisition_costs_cents` integer NOT NULL,
	`all_in_cost_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_purchases_user_date` ON `purchases` (`user_id`,`purchased_at`);--> statement-breakpoint
CREATE TABLE `source_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`captured_at` integer NOT NULL,
	`demo_record` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_records_source_hash` ON `source_records` (`source_id`,`payload_hash`);--> statement-breakpoint
CREATE INDEX `idx_source_records_listing_time` ON `source_records` (`source_id`,`source_listing_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlists_user_name_mode` ON `watchlists` (`user_id`,`name`,`data_mode`);--> statement-breakpoint
DROP INDEX `idx_review_status_severity`;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `review_queue` ADD `data_mode` text DEFAULT 'production' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_review_user_status_severity` ON `review_queue` (`user_id`,`status`,`severity`);--> statement-breakpoint
ALTER TABLE `deal_scores` ADD `maximum_all_in_cost_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deal_scores` ADD `demo_record` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `data_mode` text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `source_listing_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `source_marketplace` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `source_listing_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `availability_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `detected_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `last_verified_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `data_mode` text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE `shadow_trades` ADD `economics_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `shadow_trades` ADD `model_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `shadow_trades` ADD `data_mode` text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE `valuation_snapshots` ADD `demo_record` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `watchlist_items` ADD `watchlist_id` text REFERENCES watchlists(id);--> statement-breakpoint
ALTER TABLE `watchlist_items` ADD `data_mode` text DEFAULT 'production' NOT NULL;