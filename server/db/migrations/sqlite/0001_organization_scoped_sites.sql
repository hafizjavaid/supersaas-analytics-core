-- SQLite cannot add a NOT NULL column, so the table is recreated. Existing Sites go to the oldest Organization.
-- Recreating `sites` under its own name (not renaming a copy) lets the deferred foreign keys of child rows resolve again.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__sites_backup` AS SELECT * FROM `sites`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `sites` (`id`, `organization_id`, `name`, `domain`, `timezone`, `created_at`)
	SELECT `id`, (SELECT `id` FROM `organization` ORDER BY `created_at` LIMIT 1), `name`, `domain`, `timezone`, `created_at`
	FROM `__sites_backup`
	WHERE EXISTS (SELECT 1 FROM `organization`);--> statement-breakpoint
DROP TABLE `__sites_backup`;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_organization_domain_idx` ON `sites` (`organization_id`,`domain`);--> statement-breakpoint
CREATE INDEX `sites_organization_id_idx` ON `sites` (`organization_id`);
