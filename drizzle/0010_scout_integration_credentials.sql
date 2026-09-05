CREATE TABLE `scout_integration_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`token_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`oauth_subject` text NOT NULL,
	`scopes_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `scout_integration_label_length` CHECK (length(trim(`label`)) BETWEEN 1 AND 100),
	CONSTRAINT `scout_integration_token_id_format` CHECK (length(`token_id`) BETWEEN 20 AND 64 AND `token_id` NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT `scout_integration_token_hash_format` CHECK (length(`token_hash`) = 64 AND `token_hash` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `scout_integration_oauth_subject_format` CHECK (length(`oauth_subject`) BETWEEN 8 AND 27 AND `oauth_subject` GLOB 'github:[1-9]*' AND substr(`oauth_subject`, 8) NOT GLOB '*[^0-9]*'),
	CONSTRAINT `scout_integration_scopes_json` CHECK (`scopes_json` IN ('["scout:read"]', '["scout:write"]', '["scout:read","scout:write"]')),
	CONSTRAINT `scout_integration_expiry_after_creation` CHECK (`expires_at` IS NULL OR `expires_at` > `created_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_integration_token_id` ON `scout_integration_credentials` (`token_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scout_integration_token_hash` ON `scout_integration_credentials` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_scout_integration_user_created` ON `scout_integration_credentials` (`user_id`,`created_at`);
