CREATE TABLE `organization_usage` (
	`organization_id` text NOT NULL,
	`month` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`warning_sent_at` integer,
	`reached_sent_at` integer,
	PRIMARY KEY(`organization_id`, `month`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
