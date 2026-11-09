import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { DigestReport } from "../../../shared/types/digests";
import type { DigestFrequency } from "../../../shared/utils/digests";
import { member } from "./auth";
import { sites } from "./sites";

export const digestSubscriptions = sqliteTable("digest_subscriptions", {
	memberId: text().notNull().references(() => member.id, { onDelete: "cascade" }),
	siteId: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	frequency: text().$type<DigestFrequency>().notNull(),
	updatedAt: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.memberId, table.siteId] }),
	index("idx_digest_subscriptions_site").on(table.siteId),
]);

// One per Site, frequency and period: the unique index is what keeps a re-run from emailing a Digest twice.
export const digests = sqliteTable("digests", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	frequency: text().$type<DigestFrequency>().notNull(),
	fromDate: text().notNull(),
	toDate: text().notNull(),
	summary: text(),
	report: text({ mode: "json" }).$type<DigestReport>().notNull(),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_digests_period").on(table.siteId, table.frequency, table.fromDate),
	index("idx_digests_site").on(table.siteId, table.toDate),
]);
