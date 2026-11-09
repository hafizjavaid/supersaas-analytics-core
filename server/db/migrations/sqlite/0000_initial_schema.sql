CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organization_id_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_user_idx` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `member_user_id_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	`active_organization_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `daily_devices` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`device_type` text NOT NULL,
	`browser` text NOT NULL,
	`os` text DEFAULT '' NOT NULL,
	`visits` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `device_type`, `browser`, `os`)
);
--> statement-breakpoint
CREATE TABLE `daily_events` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `name`)
);
--> statement-breakpoint
CREATE TABLE `daily_locations` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`country` text NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`visits` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `country`, `region`, `city`)
);
--> statement-breakpoint
CREATE TABLE `daily_outbound_links` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`url` text NOT NULL,
	`clicks` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `url`)
);
--> statement-breakpoint
CREATE TABLE `daily_pages` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`path` text NOT NULL,
	`pageviews` integer NOT NULL,
	`visitors` integer NOT NULL,
	`entrances` integer DEFAULT 0 NOT NULL,
	`exits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `path`)
);
--> statement-breakpoint
CREATE TABLE `daily_sources` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`referrer_domain` text NOT NULL,
	`utm_source` text DEFAULT '' NOT NULL,
	`utm_medium` text DEFAULT '' NOT NULL,
	`utm_campaign` text DEFAULT '' NOT NULL,
	`visits` integer NOT NULL,
	PRIMARY KEY(`site_id`, `date`, `referrer_domain`, `utm_source`, `utm_medium`, `utm_campaign`)
);
--> statement-breakpoint
CREATE TABLE `daily_summary` (
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`visitors` integer NOT NULL,
	`visits` integer NOT NULL,
	`pageviews` integer NOT NULL,
	`bounce_rate` real NOT NULL,
	`avg_duration_seconds` real NOT NULL,
	PRIMARY KEY(`site_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_domain_unique` ON `sites` (`domain`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`browser` text NOT NULL,
	`os` text NOT NULL,
	`device_type` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_devices_unique` ON `devices` (`browser`,`os`,`device_type`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`name` text NOT NULL,
	`props` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_site_name_ts` ON `events` (`site_id`,`name`,`timestamp`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`country` text NOT NULL,
	`region` text,
	`city` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_locations_unique` ON `locations` (`country`,`region`,`city`);--> statement-breakpoint
CREATE TABLE `outbound_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`url` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_outbound_links_site_ts` ON `outbound_links` (`site_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`path` text NOT NULL,
	`title` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pages_site_ts` ON `pages` (`site_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_pages_visit` ON `pages` (`visit_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`referrer_domain` text DEFAULT '(direct)' NOT NULL,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_unique` ON `sources` (`site_id`,`referrer_domain`,`utm_source`,`utm_medium`,`utm_campaign`);--> statement-breakpoint
CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`last_latitude` real,
	`last_longitude` real,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_visitors_site_seen` ON `visitors` (`site_id`,`last_seen`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`entry_page` text,
	`exit_page` text,
	`page_count` integer DEFAULT 1 NOT NULL,
	`is_bounce` integer DEFAULT true NOT NULL,
	`source_id` integer,
	`device_id` integer,
	`location_id` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_visits_site_started` ON `visits` (`site_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_visits_visitor` ON `visits` (`visitor_id`,`started_at`);