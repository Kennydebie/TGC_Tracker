CREATE TABLE `ebay_deletion_listing_targets` (
	`notification_id` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`listing_id` text NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `ebay_deletion_receipts`(`notification_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ebay_deletion_listing_target` ON `ebay_deletion_listing_targets` (`notification_id`,`source_listing_id`,`listing_id`);--> statement-breakpoint
CREATE TABLE `ebay_deletion_receipts` (
	`notification_id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`schema_version` text NOT NULL,
	`event_date` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`status` text NOT NULL,
	`counts_json` text DEFAULT '{}' NOT NULL,
	`hmac_key_version` text DEFAULT 'v1' NOT NULL,
	`processing_token` text
);
--> statement-breakpoint
CREATE TABLE `ebay_deletion_valuation_targets` (
	`notification_id` text NOT NULL,
	`valuation_id` text NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `ebay_deletion_receipts`(`notification_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ebay_deletion_valuation_target` ON `ebay_deletion_valuation_targets` (`notification_id`,`valuation_id`);--> statement-breakpoint
CREATE TABLE `ebay_suppressed_identities` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`identity_type` text NOT NULL,
	`hmac_key_version` text DEFAULT 'v1' NOT NULL,
	`notification_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `ebay_deletion_receipts`(`notification_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ebay_suppressed_identity_type` ON `ebay_suppressed_identities` (`identity_type`);