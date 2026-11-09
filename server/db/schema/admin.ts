import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The audit log of super-admins viewing as a user. Emails are copied so a row outlives either account.
export const impersonations = sqliteTable("impersonations", {
	id: text().primaryKey(),
	sessionId: text().notNull(),
	adminUserId: text().notNull(),
	adminEmail: text().notNull(),
	targetUserId: text().notNull(),
	targetEmail: text().notNull(),
	startedAt: integer().notNull(),
	expiresAt: integer().notNull(),
	endedAt: integer(),
}, table => [
	uniqueIndex("idx_impersonations_session").on(table.sessionId),
	index("idx_impersonations_started").on(table.startedAt),
	index("idx_impersonations_admin_open").on(table.adminUserId, table.endedAt),
]);
