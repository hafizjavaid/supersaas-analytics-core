CREATE INDEX `idx_events_visit` ON `events` (`visit_id`);--> statement-breakpoint
CREATE INDEX `idx_outbound_links_visitor` ON `outbound_links` (`visitor_id`,`timestamp`);