CREATE TABLE `impersonations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`admin_user_id` text NOT NULL,
	`admin_email` text NOT NULL,
	`target_user_id` text NOT NULL,
	`target_email` text NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_impersonations_session` ON `impersonations` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_impersonations_started` ON `impersonations` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_impersonations_admin_open` ON `impersonations` (`admin_user_id`,`ended_at`);