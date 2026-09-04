CREATE TABLE `marktplaats_listing_details` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`location` text,
	`public_snippet` text,
	`thumbnail_url` text,
	`listing_timestamp_text` text,
	`delivery` text,
	`found_by_queries_json` text DEFAULT '[]' NOT NULL,
	`assessment_json` text DEFAULT '{}' NOT NULL,
	`distance_km` real,
	`pickup_cost_cents` integer,
	`missing_scan_count` integer DEFAULT 0 NOT NULL,
	`last_title` text NOT NULL,
	`last_location` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_marktplaats_details_missing` ON `marktplaats_listing_details` (`missing_scan_count`);--> statement-breakpoint
CREATE TABLE `marktplaats_listing_discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`search_id` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_id`) REFERENCES `marktplaats_search_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marktplaats_discovery_listing_search` ON `marktplaats_listing_discoveries` (`listing_id`,`search_id`);--> statement-breakpoint
CREATE INDEX `idx_marktplaats_discovery_search_time` ON `marktplaats_listing_discoveries` (`search_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `marktplaats_listing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_marktplaats_events_listing_time` ON `marktplaats_listing_events` (`listing_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_marktplaats_events_kind_time` ON `marktplaats_listing_events` (`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `marktplaats_search_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`minimum_price_cents` integer,
	`maximum_price_cents` integer,
	`postcode` text,
	`distance_km` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marktplaats_search_query` ON `marktplaats_search_definitions` (`query`);--> statement-breakpoint
CREATE INDEX `idx_marktplaats_search_enabled_kind` ON `marktplaats_search_definitions` (`enabled`,`kind`);--> statement-breakpoint
CREATE TABLE `marktplaats_source_health` (
	`source_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`blocked_code` text,
	`automatic_retry_at` integer,
	`last_successful_scan_at` integer,
	`next_scan_at` integer,
	`parser_confidence_bps` integer,
	`queries` integer DEFAULT 0 NOT NULL,
	`pages_fetched` integer DEFAULT 0 NOT NULL,
	`listings_parsed` integer DEFAULT 0 NOT NULL,
	`new_listings` integer DEFAULT 0 NOT NULL,
	`qualified` integer DEFAULT 0 NOT NULL,
	`review` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`price_drops` integer DEFAULT 0 NOT NULL,
	`alerts` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scan_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_job_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
