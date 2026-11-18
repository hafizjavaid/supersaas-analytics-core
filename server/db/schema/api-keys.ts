import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";

// Only the SHA-256 of a key is kept; `prefix` is its first characters, shown so a key can be recognised in the list.
export const apiKeys = sqliteTable("api_keys", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	name: text().notNull(),
	keyHash: text().notNull(),
	prefix: text().notNull(),
	createdBy: text().references(() => user.id, { onDelete: "set null" }),
	createdAt: integer().notNull(),
	lastUsedAt: integer(),
}, table => [
	uniqueIndex("idx_api_keys_hash").on(table.keyHash),
	index("idx_api_keys_organization").on(table.organizationId, table.createdAt),
]);
