CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_payment_id` text NOT NULL,
	`provider_customer_id` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_provider_payment` ON `payments` (`site_id`,`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_site_paid` ON `payments` (`site_id`,`paid_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_visitor` ON `payments` (`visitor_id`);--> statement-breakpoint
CREATE TABLE `revenue_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`environment` text NOT NULL,
	`access_token` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revenue_connections_site` ON `revenue_connections` (`site_id`);