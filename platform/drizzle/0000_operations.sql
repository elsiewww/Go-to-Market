CREATE TABLE `ops_history` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`revision` integer NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `ops_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_revision` ON `ops_history` (`record_id`,`revision`);--> statement-breakpoint
CREATE INDEX `history_created` ON `ops_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `ops_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`agent_id` text,
	`status` text NOT NULL,
	`details` text NOT NULL,
	`evidence` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`origin_hash` text NOT NULL,
	`event_id` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `ops_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_agent` ON `ops_records` (`agent_id`);--> statement-breakpoint
CREATE INDEX `records_updated` ON `ops_records` (`updated_at`);