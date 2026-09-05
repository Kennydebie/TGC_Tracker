CREATE TABLE `scout_ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`external_run_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('completed', 'partial', 'failed')),
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`findings_received` integer DEFAULT 0 NOT NULL,
	`inserted_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`unchanged_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`errors_json` text DEFAULT '[]' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL CHECK (`data_mode` = 'production'),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_ingestion_run_user_external` ON `scout_ingestion_runs` (`user_id`,`external_run_id`);
--> statement-breakpoint
CREATE INDEX `idx_scout_ingestion_run_user_finished` ON `scout_ingestion_runs` (`user_id`,`finished_at`);
--> statement-breakpoint
CREATE TABLE `scout_ingestion_source_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`run_id` text NOT NULL,
	`source_identifier` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('checked', 'inaccessible', 'failed')),
	`checked_at` integer NOT NULL,
	`coverage_through` integer,
	`error_code` text,
	`detail` text,
	`data_mode` text DEFAULT 'production' NOT NULL CHECK (`data_mode` = 'production'),
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `scout_ingestion_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_source_check_user_run_source` ON `scout_ingestion_source_checks` (`user_id`,`run_id`,`source_identifier`);
--> statement-breakpoint
CREATE INDEX `idx_scout_source_check_user_source_time` ON `scout_ingestion_source_checks` (`user_id`,`source_identifier`,`checked_at`);
--> statement-breakpoint
CREATE TABLE `scout_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`source_kind` text NOT NULL CHECK (`source_kind` IN ('reddit_post', 'reddit_comment', 'retailer', 'official', 'public_web')),
	`source_identifier` text NOT NULL,
	`game` text NOT NULL CHECK (`game` IN ('pokemon', 'riftbound')),
	`product_name` text,
	`product_language` text,
	`update_type` text NOT NULL CHECK (`update_type` IN ('deal', 'restock', 'preorder', 'price_change', 'reprint', 'release', 'market_update')),
	`summary` text NOT NULL,
	`source_url` text,
	`subreddit` text,
	`source_post_or_comment_id` text,
	`retailer_name` text,
	`retailer_or_official_url` text,
	`published_at` integer,
	`first_observed_at` integer NOT NULL,
	`last_observed_at` integer NOT NULL,
	`price_cents` integer,
	`currency` text CHECK (`currency` IS NULL OR `currency` IN ('EUR', 'GBP', 'USD')),
	`region` text,
	`shipping_to_netherlands` text NOT NULL CHECK (`shipping_to_netherlands` IN ('confirmed', 'unavailable', 'unknown')),
	`availability` text NOT NULL CHECK (`availability` IN ('in_stock', 'preorder', 'sold_out', 'unknown')),
	`verification_status` text NOT NULL CHECK (`verification_status` IN ('community_report', 'retailer_checked', 'official_checked')),
	`verification_evidence_url` text,
	`verification_observed_at` integer,
	`verification_evidence_json` text,
	`collection_method` text DEFAULT 'chatgpt_web_research' NOT NULL CHECK (`collection_method` = 'chatgpt_web_research'),
	`material_hash` text NOT NULL,
	`latest_run_id` text NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL CHECK (`data_mode` = 'production'),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`latest_run_id`) REFERENCES `scout_ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK ((`price_cents` IS NULL AND `currency` IS NULL) OR (`price_cents` IS NOT NULL AND `currency` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_finding_user_dedupe` ON `scout_findings` (`user_id`,`dedupe_key`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_observed` ON `scout_findings` (`user_id`,`last_observed_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_source` ON `scout_findings` (`user_id`,`source_identifier`,`source_post_or_comment_id`);
--> statement-breakpoint
CREATE TABLE `scout_finding_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`run_id` text NOT NULL,
	`material_hash` text NOT NULL,
	`observed_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`data_mode` text DEFAULT 'production' NOT NULL CHECK (`data_mode` = 'production'),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `scout_findings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `scout_ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_observation_user_finding_material` ON `scout_finding_observations` (`user_id`,`finding_id`,`material_hash`);
--> statement-breakpoint
CREATE INDEX `idx_scout_observation_user_finding_time` ON `scout_finding_observations` (`user_id`,`finding_id`,`observed_at`);
