CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`password_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_share_links_token` ON `share_links` (`token`);--> statement-breakpoint
CREATE INDEX `idx_share_links_site` ON `share_links` (`site_id`,`created_at`);