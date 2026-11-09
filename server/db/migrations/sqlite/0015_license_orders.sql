CREATE TABLE `license_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`polar_order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`key` text NOT NULL,
	`issued_at` integer NOT NULL,
	`emailed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_license_orders_polar_order` ON `license_orders` (`polar_order_id`);--> statement-breakpoint
CREATE INDEX `idx_license_orders_product` ON `license_orders` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_license_orders_user` ON `license_orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_license_orders_email` ON `license_orders` (`email`);