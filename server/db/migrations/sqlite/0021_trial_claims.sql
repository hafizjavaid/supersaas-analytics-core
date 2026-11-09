CREATE TABLE `trial_claims` (
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`organization_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `value`)
);
--> statement-breakpoint
-- Existing Owners and Sites have had their Trial: the oldest Organization keeps each claim. The SQL mirrors
-- trialEmailKey and trialDomainKey for the common shapes (a +tag; a scheme, www., a port or a path).
INSERT OR IGNORE INTO `trial_claims` (`kind`, `value`, `organization_id`, `claimed_at`)
SELECT 'email', CASE WHEN instr(local, '+') > 0 THEN substr(local, 1, instr(local, '+') - 1) ELSE local END || domain, organization_id, created_at
FROM (
	SELECT substr(email, 1, instr(email, '@') - 1) AS local, substr(email, instr(email, '@')) AS domain, organization_id, created_at
	FROM (
		SELECT lower(trim(`user`.`email`)) AS email, `member`.`organization_id`, `organization`.`created_at`
		FROM `member`
		JOIN `user` ON `user`.`id` = `member`.`user_id`
		JOIN `organization` ON `organization`.`id` = `member`.`organization_id`
		WHERE `member`.`role` = 'owner'
	)
)
ORDER BY created_at;
--> statement-breakpoint
INSERT OR IGNORE INTO `trial_claims` (`kind`, `value`, `organization_id`, `claimed_at`)
SELECT 'domain', CASE WHEN host LIKE 'www.%' THEN substr(host, 5) ELSE host END, organization_id, created_at
FROM (
	SELECT CASE WHEN instr(host_and_port, ':') > 0 THEN substr(host_and_port, 1, instr(host_and_port, ':') - 1) ELSE host_and_port END AS host, organization_id, created_at
	FROM (
		SELECT CASE WHEN instr(bare, '/') > 0 THEN substr(bare, 1, instr(bare, '/') - 1) ELSE bare END AS host_and_port, organization_id, created_at
		FROM (
			SELECT CASE WHEN instr(domain, '://') > 0 THEN substr(domain, instr(domain, '://') + 3) ELSE domain END AS bare, organization_id, created_at
			FROM (SELECT lower(trim(`domain`)) AS domain, `organization_id`, `created_at` FROM `sites`)
		)
	)
)
ORDER BY created_at;
