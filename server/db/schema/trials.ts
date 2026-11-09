import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One Trial per Owner email and per Site domain (`trialEmailKey`, `trialDomainKey`). No foreign key: a claim must
// outlive its Organization, or deleting it would hand out a fresh Trial.
export const trialClaims = sqliteTable("trial_claims", {
	kind: text({ enum: ["email", "domain"] }).notNull(),
	value: text().notNull(),
	organizationId: text().notNull(),
	claimedAt: integer().notNull(),
}, table => [primaryKey({ columns: [table.kind, table.value] })]);
