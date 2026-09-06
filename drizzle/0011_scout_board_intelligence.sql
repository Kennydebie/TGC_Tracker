ALTER TABLE `scout_findings` ADD COLUMN `headline` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `event_at` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_opens_at` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_deadline_at` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `event_sort_at` integer;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_opens_sort_at` integer;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_deadline_sort_at` integer;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_type` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_instruction` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `action_url` text;
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `lifecycle_status` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `scout_findings` ADD COLUMN `material_changed_at` integer;
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_event` ON `scout_findings` (`user_id`,`event_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_action_opens` ON `scout_findings` (`user_id`,`action_opens_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_action_deadline` ON `scout_findings` (`user_id`,`action_deadline_sort_at`);
--> statement-breakpoint
CREATE INDEX `idx_scout_finding_user_lifecycle` ON `scout_findings` (`user_id`,`lifecycle_status`);
