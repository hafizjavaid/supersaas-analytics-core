PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily_events` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `name`, `path`)
);
--> statement-breakpoint
-- Days rolled up before Events kept their page get an empty path, the same as an Event sent without one.
INSERT INTO `__new_daily_events`("site_id", "date", "name", "path", "count") SELECT "site_id", "date", "name", '', "count" FROM `daily_events`;--> statement-breakpoint
DROP TABLE `daily_events`;--> statement-breakpoint
ALTER TABLE `__new_daily_events` RENAME TO `daily_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;