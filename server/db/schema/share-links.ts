import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sites } from "./sites";

export const shareLinks = sqliteTable("share_links", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	name: text().notNull(),
	token: text().notNull(),
	passwordHash: text(),
	outboundUrl: text(),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_share_links_token").on(table.token),
	index("idx_share_links_site").on(table.siteId, table.createdAt),
]);
