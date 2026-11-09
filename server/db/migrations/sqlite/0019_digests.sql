CREATE TABLE `digest_subscriptions` (
	`member_id` text NOT NULL,
	`site_id` text NOT NULL,
	`frequency` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `site_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_digest_subscriptions_site` ON `digest_subscriptions` (`site_id`);--> statement-breakpoint
CREATE TABLE `digests` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`frequency` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`summary` text,
	`report` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_digests_period` ON `digests` (`site_id`,`frequency`,`from_date`);--> statement-breakpoint
CREATE INDEX `idx_digests_site` ON `digests` (`site_id`,`to_date`);