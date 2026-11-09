ALTER TABLE `sites` ADD `excluded_ips` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `excluded_paths` text DEFAULT '[]' NOT NULL;