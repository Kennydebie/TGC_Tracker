CREATE TABLE `discord_worker_health` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`updated_at` integer NOT NULL,
	`last_message_at` integer,
	`last_ingest_at` integer
);
