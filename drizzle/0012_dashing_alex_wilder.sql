-- D1 keeps foreign-key enforcement enabled during migrations. Defer checks
-- while the parent and its observation table are rebuilt, then restore both
-- relationships before enforcement resumes.
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
CREATE TABLE `__new_scout_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`source_kind` text NOT NULL CHECK (`source_kind` IN ('reddit_post', 'reddit_comment', 'retailer', 'official', 'public_web')),
	`source_identifier` text NOT NULL,
	`game` text NOT NULL CHECK (`game` IN ('pokemon', 'one_piece', 'riftbound')),
	`headline` text,
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
	`event_at` text,
	`action_opens_at` text,
	`action_deadline_at` text,
	`event_sort_at` integer,
	`action_opens_sort_at` integer,
	`action_deadline_sort_at` integer,
	`action_type` text,
	`action_instruction` text,
	`action_url` text,
	`lifecycle_status` text DEFAULT 'unknown' NOT NULL,
	`first_observed_at` integer NOT NULL,
	`last_observed_at` integer NOT NULL,
	`material_changed_at` integer,
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
INSERT INTO `__new_scout_findings` (
	`id`, `user_id`, `dedupe_key`, `source_kind`, `source_identifier`, `game`,
	`headline`, `product_name`, `product_language`, `update_type`, `summary`,
	`source_url`, `subreddit`, `source_post_or_comment_id`, `retailer_name`,
	`retailer_or_official_url`, `published_at`, `event_at`, `action_opens_at`,
	`action_deadline_at`, `event_sort_at`, `action_opens_sort_at`,
	`action_deadline_sort_at`, `action_type`, `action_instruction`, `action_url`,
	`lifecycle_status`, `first_observed_at`, `last_observed_at`,
	`material_changed_at`, `price_cents`, `currency`, `region`,
	`shipping_to_netherlands`, `availability`, `verification_status`,
	`verification_evidence_url`, `verification_observed_at`,
	`verification_evidence_json`, `collection_method`, `material_hash`,
	`latest_run_id`, `data_mode`, `created_at`, `updated_at`
)
SELECT
	`id`, `user_id`, `dedupe_key`, `source_kind`, `source_identifier`, `game`,
	`headline`, `product_name`, `product_language`, `update_type`, `summary`,
	`source_url`, `subreddit`, `source_post_or_comment_id`, `retailer_name`,
	`retailer_or_official_url`, `published_at`, `event_at`, `action_opens_at`,
	`action_deadline_at`, `event_sort_at`, `action_opens_sort_at`,
	`action_deadline_sort_at`, `action_type`, `action_instruction`, `action_url`,
	`lifecycle_status`, `first_observed_at`, `last_observed_at`,
	`material_changed_at`, `price_cents`, `currency`, `region`,
	`shipping_to_netherlands`, `availability`, `verification_status`,
	`verification_evidence_url`, `verification_observed_at`,
	`verification_evidence_json`, `collection_method`, `material_hash`,
	`latest_run_id`, `data_mode`, `created_at`, `updated_at`
FROM `scout_findings`;
--> statement-breakpoint
CREATE TABLE `__scout_finding_observations_backup` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`run_id` text NOT NULL,
	`material_hash` text NOT NULL,
	`observed_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`data_mode` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__scout_finding_observations_backup`
SELECT
	`id`, `user_id`, `finding_id`, `run_id`, `material_hash`, `observed_at`,
	`payload_json`, `data_mode`, `created_at`, `updated_at`
FROM `scout_finding_observations`;
--> statement-breakpoint
DROP TABLE `scout_finding_observations`;
--> statement-breakpoint
DROP TABLE `scout_findings`;
--> statement-breakpoint
ALTER TABLE `__new_scout_findings` RENAME TO `scout_findings`;
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
INSERT INTO `scout_finding_observations`
SELECT
	`id`, `user_id`, `finding_id`, `run_id`, `material_hash`, `observed_at`,
	`payload_json`, `data_mode`, `created_at`, `updated_at`
FROM `__scout_finding_observations_backup`;
--> statement-breakpoint
DROP TABLE `__scout_finding_observations_backup`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_finding_user_dedupe` ON `scout_findings` (`user_id`, `dedupe_key`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_observed` ON `scout_findings` (`user_id`, `last_observed_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_event` ON `scout_findings` (`user_id`, `event_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_action_opens` ON `scout_findings` (`user_id`, `action_opens_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_action_deadline` ON `scout_findings` (`user_id`, `action_deadline_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_lifecycle` ON `scout_findings` (`user_id`, `lifecycle_status`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_source` ON `scout_findings` (`user_id`, `source_identifier`, `source_post_or_comment_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_observation_user_finding_material` ON `scout_finding_observations` (`user_id`, `finding_id`, `material_hash`);
--> statement-breakpoint
CREATE INDEX `idx_scout_observation_user_finding_time` ON `scout_finding_observations` (`user_id`, `finding_id`, `observed_at`);
--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
