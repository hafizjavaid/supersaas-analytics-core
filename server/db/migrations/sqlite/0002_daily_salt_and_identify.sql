CREATE TABLE `daily_salts` (
	`day` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL
);
--> statement-breakpoint
-- SQLite cannot add a NOT NULL column without a default, so existing Sites get one and then a random secret each.
ALTER TABLE `sites` ADD `secret` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `sites` SET `secret` = lower(hex(randomblob(32))) WHERE `secret` = '';--> statement-breakpoint
ALTER TABLE `visitors` ADD `identity_hash` text;--> statement-breakpoint
CREATE INDEX `idx_visitors_site_identity` ON `visitors` (`site_id`,`identity_hash`);
