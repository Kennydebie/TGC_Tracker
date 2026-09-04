CREATE TABLE `community_author_reliability` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`pseudonymous_author_id` text NOT NULL,
	`signals_submitted` integer DEFAULT 0 NOT NULL,
	`signals_verified` integer DEFAULT 0 NOT NULL,
	`signals_false` integer DEFAULT 0 NOT NULL,
	`signals_expired` integer DEFAULT 0 NOT NULL,
	`signals_price_changed_before_verification` integer DEFAULT 0 NOT NULL,
	`reliability_score_bps` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_author_platform_hash` ON `community_author_reliability` (`platform`,`pseudonymous_author_id`);--> statement-breakpoint
CREATE TABLE `community_event_signals` (
	`event_id` text NOT NULL,
	`signal_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `community_signal_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`signal_id`) REFERENCES `community_signals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_event_signal` ON `community_event_signals` (`event_id`,`signal_id`);--> statement-breakpoint
CREATE INDEX `idx_community_event_signals_signal` ON `community_event_signals` (`signal_id`);--> statement-breakpoint
CREATE TABLE `community_hype_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`calculated_at` integer NOT NULL,
	`hype_risk_score` integer NOT NULL,
	`low_history_author_ratio_bps` integer DEFAULT 0 NOT NULL,
	`repeated_text_ratio_bps` integer DEFAULT 0 NOT NULL,
	`repeated_link_ratio_bps` integer DEFAULT 0 NOT NULL,
	`dominant_source_ratio_bps` integer DEFAULT 0 NOT NULL,
	`cross_post_ratio_bps` integer DEFAULT 0 NOT NULL,
	`indicators_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `community_signal_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_hype_event_time` ON `community_hype_metrics` (`event_id`,`calculated_at`);--> statement-breakpoint
CREATE TABLE `community_lead_time` (
	`id` text PRIMARY KEY NOT NULL,
	`verification_id` text NOT NULL,
	`source_id` text NOT NULL,
	`community_detected_at` integer NOT NULL,
	`market_source_detected_at` integer NOT NULL,
	`official_source_detected_at` integer,
	`lead_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`verification_id`) REFERENCES `community_verifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `community_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_lead_source_time` ON `community_lead_time` (`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_product_momentum` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_product_id` text NOT NULL,
	`calculated_at` integer NOT NULL,
	`mentions_15m` integer DEFAULT 0 NOT NULL,
	`mentions_1h` integer DEFAULT 0 NOT NULL,
	`mentions_6h` integer DEFAULT 0 NOT NULL,
	`mentions_24h` integer DEFAULT 0 NOT NULL,
	`mentions_7d` integer DEFAULT 0 NOT NULL,
	`unique_authors` integer DEFAULT 0 NOT NULL,
	`unique_communities` integer DEFAULT 0 NOT NULL,
	`momentum_score` integer NOT NULL,
	`divergence_score` integer NOT NULL,
	`hype_risk_score` integer NOT NULL,
	`classification` text NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_community_momentum_product_time` ON `community_product_momentum` (`canonical_product_id`,`calculated_at`);--> statement-breakpoint
CREATE INDEX `idx_community_momentum_score_time` ON `community_product_momentum` (`momentum_score`,`calculated_at`);--> statement-breakpoint
CREATE TABLE `community_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`events_received` integer DEFAULT 0 NOT NULL,
	`messages_filtered` integer DEFAULT 0 NOT NULL,
	`signals_created` integer DEFAULT 0 NOT NULL,
	`duplicates_clustered` integer DEFAULT 0 NOT NULL,
	`products_matched` integer DEFAULT 0 NOT NULL,
	`signals_verified` integer DEFAULT 0 NOT NULL,
	`signals_rejected` integer DEFAULT 0 NOT NULL,
	`alerts_emitted` integer DEFAULT 0 NOT NULL,
	`rate_limit_remaining` integer,
	`classification_latency_ms` integer,
	`error_code` text,
	`error_detail` text
);
--> statement-breakpoint
CREATE INDEX `idx_community_scan_platform_time` ON `community_scan_runs` (`platform`,`started_at`);--> statement-breakpoint
CREATE TABLE `community_shadow_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`shadow_trade_id` text NOT NULL,
	`community_event_id` text NOT NULL,
	`community_detected_at` integer NOT NULL,
	`market_verified_at` integer,
	`price_at_community_detection_cents` integer,
	`price_at_verification_cents` integer,
	`price_after_1h_cents` integer,
	`price_after_24h_cents` integer,
	`price_after_7d_cents` integer,
	`community_momentum` integer NOT NULL,
	`divergence_score` integer NOT NULL,
	`hype_risk_score` integer NOT NULL,
	`source_reliability` integer NOT NULL,
	`economics_json` text DEFAULT '{}' NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shadow_trade_id`) REFERENCES `shadow_trades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_event_id`) REFERENCES `community_signal_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_shadow_trade` ON `community_shadow_evaluations` (`shadow_trade_id`);--> statement-breakpoint
CREATE INDEX `idx_community_shadow_event` ON `community_shadow_evaluations` (`community_event_id`);--> statement-breakpoint
CREATE TABLE `community_signal_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`signal_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`evidence_start` integer,
	`evidence_end` integer,
	FOREIGN KEY (`signal_id`) REFERENCES `community_signals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_entity_signal` ON `community_signal_entities` (`signal_id`);--> statement-breakpoint
CREATE INDEX `idx_community_entity_kind_value` ON `community_signal_entities` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `community_signal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`canonical_product_id` text,
	`signal_type` text NOT NULL,
	`retailer` text,
	`marketplace` text,
	`price_cents` integer,
	`currency` text,
	`first_detected_at` integer NOT NULL,
	`last_detected_at` integer NOT NULL,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`unique_author_count` integer DEFAULT 0 NOT NULL,
	`unique_community_count` integer DEFAULT 1 NOT NULL,
	`platforms_json` text DEFAULT '[]' NOT NULL,
	`source_ids_json` text DEFAULT '[]' NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_event_dedupe` ON `community_signal_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_community_event_product_time` ON `community_signal_events` (`canonical_product_id`,`last_detected_at`);--> statement-breakpoint
CREATE TABLE `community_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`platform` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`canonical_product_id` text,
	`author_reliability_id` text,
	`signal_type` text NOT NULL,
	`price_cents` integer,
	`currency` text,
	`retailer_mention` text,
	`marketplace_mention` text,
	`country_mention` text,
	`region_mention` text,
	`language` text,
	`quantity` integer,
	`urls_json` text DEFAULT '[]' NOT NULL,
	`restock_flag` integer DEFAULT false NOT NULL,
	`reprint_flag` integer DEFAULT false NOT NULL,
	`release_flag` integer DEFAULT false NOT NULL,
	`scarcity_flag` integer DEFAULT false NOT NULL,
	`fraud_warning_flag` integer DEFAULT false NOT NULL,
	`sentiment` text NOT NULL,
	`intent` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`official_reference` integer DEFAULT false NOT NULL,
	`unresolved` integer DEFAULT false NOT NULL,
	`text_hash` text NOT NULL,
	`raw_excerpt` text,
	`raw_expires_at` integer,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `community_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_signal_source_external` ON `community_signals` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_community_signal_product_time` ON `community_signals` (`canonical_product_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_community_signal_type_time` ON `community_signals` (`signal_type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_community_signal_unresolved` ON `community_signals` (`unresolved`,`confidence_bps`);--> statement-breakpoint
CREATE TABLE `community_source_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`user_id` text,
	`scan_interval_minutes` integer,
	`cursor_json` text DEFAULT '{}' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`raw_retention_hours` integer DEFAULT 24 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `community_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_source_config_source_user` ON `community_source_configs` (`source_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `community_source_reliability` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`signals_submitted` integer DEFAULT 0 NOT NULL,
	`signals_verified` integer DEFAULT 0 NOT NULL,
	`signals_false` integer DEFAULT 0 NOT NULL,
	`median_lead_minutes` integer,
	`reliability_score_bps` integer,
	`calculated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `community_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_source_reliability_source` ON `community_source_reliability` (`source_id`);--> statement-breakpoint
CREATE TABLE `community_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`external_community_id` text NOT NULL,
	`external_channel_id` text,
	`enabled` integer DEFAULT false NOT NULL,
	`games_json` text DEFAULT '[]' NOT NULL,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`reliability_score_bps` integer,
	`status` text DEFAULT 'disabled' NOT NULL,
	`last_signal_at` integer,
	`last_error` text,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_source_external` ON `community_sources` (`platform`,`external_community_id`,`external_channel_id`);--> statement-breakpoint
CREATE INDEX `idx_community_source_enabled` ON `community_sources` (`platform`,`enabled`);--> statement-breakpoint
CREATE TABLE `community_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`status` text NOT NULL,
	`market_source` text,
	`market_listing_id` text,
	`market_url` text,
	`community_detected_at` integer NOT NULL,
	`market_verified_at` integer,
	`official_source_detected_at` integer,
	`price_at_community_detection_cents` integer,
	`price_at_verification_cents` integer,
	`delivered_price_cents` integer,
	`conservative_exit_cents` integer,
	`predicted_profit_cents` integer,
	`roi_bps` integer,
	`confidence_grade` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `community_signal_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_verification_event_time` ON `community_verifications` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_watch_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_product_id` text NOT NULL,
	`minimum_momentum` integer DEFAULT 80 NOT NULL,
	`minimum_discord_mentions` integer DEFAULT 0 NOT NULL,
	`minimum_reddit_mentions` integer DEFAULT 0 NOT NULL,
	`minimum_divergence` integer DEFAULT 70 NOT NULL,
	`maximum_hype_risk` integer DEFAULT 50 NOT NULL,
	`minimum_restock_mentions` integer DEFAULT 0 NOT NULL,
	`minimum_independent_confirmations` integer DEFAULT 2 NOT NULL,
	`official_catalyst_required` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_watch_user_product` ON `community_watch_rules` (`user_id`,`canonical_product_id`);