ALTER TABLE `daily_pages` ADD `title` text;--> statement-breakpoint
ALTER TABLE `daily_pages` ADD `visits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_pages` ADD `bounces` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_pages` ADD `time_on_page_seconds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_pages` ADD `timed_pageviews` integer DEFAULT 0 NOT NULL;