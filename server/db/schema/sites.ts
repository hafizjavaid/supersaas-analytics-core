import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "./auth";

export const sites = sqliteTable("sites", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	name: text().notNull(),
	domain: text().notNull(),
	timezone: text().notNull().default("UTC"),
	// Keys the identify() hash. It must never leave the server.
	secret: text().notNull(),
	excludedIps: text({ mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	excludedPaths: text({ mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("sites_organization_domain_idx").on(table.organizationId, table.domain),
	index("sites_organization_id_idx").on(table.organizationId),
]);
