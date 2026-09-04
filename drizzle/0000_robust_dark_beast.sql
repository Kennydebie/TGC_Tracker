CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text,
	`product_id` text,
	`priority` text NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`read_at` integer,
	`snoozed_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_alerts_user_dedupe` ON `alerts` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_alerts_user_created` ON `alerts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_user_created` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `deal_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`valuation_id` text NOT NULL,
	`instant_score` integer NOT NULL,
	`hold_score` integer NOT NULL,
	`risk_score` integer NOT NULL,
	`confidence_grade` text NOT NULL,
	`all_in_cost_cents` integer NOT NULL,
	`conservative_net_exit_cents` integer NOT NULL,
	`expected_profit_cents` integer NOT NULL,
	`roi_bps` integer NOT NULL,
	`profit_per_hour_cents` integer NOT NULL,
	`maximum_item_price_cents` integer NOT NULL,
	`preferred_exit` text NOT NULL,
	`explanation_json` text NOT NULL,
	`model_version` text NOT NULL,
	`scored_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`valuation_id`) REFERENCES `valuation_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deal_scores_listing_time` ON `deal_scores` (`listing_id`,`scored_at`);--> statement-breakpoint
CREATE INDEX `idx_deal_scores_instant_confidence` ON `deal_scores` (`instant_score`,`confidence_grade`);--> statement-breakpoint
CREATE TABLE `inventory_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`remaining_quantity` integer NOT NULL,
	`acquired_at` integer NOT NULL,
	`item_price_cents` integer NOT NULL,
	`all_in_basis_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`historical_fx_rate` real NOT NULL,
	`strategy` text NOT NULL,
	`storage_location` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_user_product` ON `inventory_lots` (`user_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`product_id` text,
	`seller_name` text,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`item_price_cents` integer NOT NULL,
	`shipping_cents` integer,
	`currency` text NOT NULL,
	`quantity` integer,
	`condition` text,
	`language` text,
	`match_confidence_bps` integer,
	`status` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`demo_record` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_listings_source_external` ON `listings` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_listings_product_status` ON `listings` (`product_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_listings_last_seen` ON `listings` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `price_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`source_id` text NOT NULL,
	`evidence_type` text NOT NULL,
	`price_cents` integer NOT NULL,
	`shipping_cents` integer,
	`currency` text NOT NULL,
	`condition` text,
	`language` text,
	`observed_at` integer NOT NULL,
	`reliability_weight` real NOT NULL,
	`excluded_reason` text,
	`demo_record` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_price_observations_product_time` ON `price_observations` (`product_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_price_observations_type` ON `price_observations` (`evidence_type`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`set_name` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`product_type` text NOT NULL,
	`language` text NOT NULL,
	`edition` text,
	`card_number` text,
	`gtin` text,
	`release_date` text,
	`msrp_cents` integer,
	`msrp_currency` text,
	`manually_verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_game_set` ON `products` (`game`,`set_name`);--> statement-breakpoint
CREATE INDEX `idx_products_gtin` ON `products` (`gtin`);--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`listing_id` text,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_review_status_severity` ON `review_queue` (`status`,`severity`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`inventory_lot_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`sold_at` integer NOT NULL,
	`venue` text NOT NULL,
	`gross_cents` integer NOT NULL,
	`total_costs_cents` integer NOT NULL,
	`net_proceeds_cents` integer NOT NULL,
	`realised_profit_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sales_user_date` ON `sales` (`user_id`,`sold_at`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`records_fetched` integer DEFAULT 0 NOT NULL,
	`records_normalised` integer DEFAULT 0 NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`unmatched` integer DEFAULT 0 NOT NULL,
	`alerts` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_scan_runs_source_started` ON `scan_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `shadow_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`detected_price_cents` integer NOT NULL,
	`executable_price_cents` integer,
	`predicted_profit_cents` integer NOT NULL,
	`later_supported_profit_cents` integer,
	`status` text NOT NULL,
	`next_follow_up_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_shadow_user_followup` ON `shadow_trades` (`user_id`,`next_follow_up_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`access_type` text NOT NULL,
	`mode` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`policy_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`country` text DEFAULT 'NL' NOT NULL,
	`postcode` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`timezone` text DEFAULT 'Europe/Amsterdam' NOT NULL,
	`local_radius_km` integer DEFAULT 50 NOT NULL,
	`labor_rate_cents` integer DEFAULT 1800 NOT NULL,
	`required_roi_bps` integer DEFAULT 2000 NOT NULL,
	`required_profit_cents` integer DEFAULT 2500 NOT NULL,
	`demo_mode` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `valuation_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`conservative_cents` integer,
	`fair_value_cents` integer,
	`optimistic_cents` integer,
	`confidence_grade` text NOT NULL,
	`observation_count` integer NOT NULL,
	`assumptions_json` text NOT NULL,
	`model_version` text NOT NULL,
	`valued_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_valuations_product_time` ON `valuation_snapshots` (`product_id`,`valued_at`);--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text,
	`listing_id` text,
	`target_all_in_cents` integer,
	`muted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_watchlist_user` ON `watchlist_items` (`user_id`);
--> statement-breakpoint
PRAGMA optimize;
