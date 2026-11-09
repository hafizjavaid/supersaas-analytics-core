CREATE TABLE `search_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`engine` text NOT NULL,
	`credential` text NOT NULL,
	`property` text,
	`synced_through` text,
	`backfilled_from` text,
	`synced_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_search_connections_site_engine` ON `search_connections` (`site_id`,`engine`);--> statement-breakpoint
CREATE TABLE `search_days` (
	`site_id` text NOT NULL,
	`engine` text NOT NULL,
	`date` text NOT NULL,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`position_sum` real NOT NULL,
	`positioned_impressions` integer NOT NULL,
	PRIMARY KEY(`site_id`, `engine`, `date`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `search_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`engine` text NOT NULL,
	`date` text NOT NULL,
	`query` text NOT NULL,
	`page` text NOT NULL,
	`path` text NOT NULL,
	`country` text NOT NULL,
	`device` text NOT NULL,
	`clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`position_sum` real NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_search_rows_site_date` ON `search_rows` (`site_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_search_rows_site_query` ON `search_rows` (`site_id`,`query`);--> statement-breakpoint
CREATE INDEX `idx_search_rows_site_path` ON `search_rows` (`site_id`,`path`,`date`);