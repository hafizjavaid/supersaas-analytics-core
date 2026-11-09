ALTER TABLE `organization` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_status` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_interval` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_period_end` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_cancel_at_period_end` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_ended_at` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_modified_at` integer;--> statement-breakpoint
-- Organizations created before the Trial existed get 7 days from now, so none stops collecting on deploy.
UPDATE `organization` SET `trial_ends_at` = MAX(`created_at`, CAST(unixepoch('subsecond') * 1000 AS INTEGER)) + 604800000 WHERE `trial_ends_at` IS NULL;
