DROP INDEX `idx_sources_unique`;--> statement-breakpoint
ALTER TABLE `sources` ADD `utm_term` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `sources` ADD `utm_content` text DEFAULT '';--> statement-breakpoint
-- SQLite cannot add a NOT NULL column without a default. Existing rows get a rough Channel (Direct or Referral):
-- the full mapping lives in shared/utils/channels.ts, and the schema started fresh before launch.
ALTER TABLE `sources` ADD `channel` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `sources` SET `channel` = CASE WHEN `referrer_domain` = '(direct)' AND COALESCE(`utm_source`, '') = '' AND COALESCE(`utm_medium`, '') = '' THEN 'direct' ELSE 'referral' END;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_unique` ON `sources` (`site_id`,`referrer_domain`,`utm_source`,`utm_medium`,`utm_campaign`,`utm_term`,`utm_content`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily_sources` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`referrer_domain` text NOT NULL,
	`utm_source` text DEFAULT '' NOT NULL,
	`utm_medium` text DEFAULT '' NOT NULL,
	`utm_campaign` text DEFAULT '' NOT NULL,
	`utm_term` text DEFAULT '' NOT NULL,
	`utm_content` text DEFAULT '' NOT NULL,
	`channel` text NOT NULL,
	`visits` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `referrer_domain`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`)
);
--> statement-breakpoint
INSERT INTO `__new_daily_sources`("site_id", "date", "referrer_domain", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "channel", "visits") SELECT "site_id", "date", "referrer_domain", "utm_source", "utm_medium", "utm_campaign", '', '', CASE WHEN `referrer_domain` = '(direct)' AND COALESCE(`utm_source`, '') = '' AND COALESCE(`utm_medium`, '') = '' THEN 'direct' ELSE 'referral' END, "visits" FROM `daily_sources`;--> statement-breakpoint
DROP TABLE `daily_sources`;--> statement-breakpoint
ALTER TABLE `__new_daily_sources` RENAME TO `daily_sources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;