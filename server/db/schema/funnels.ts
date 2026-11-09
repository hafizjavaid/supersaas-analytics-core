import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { FunnelStep, FunnelWindow } from "../../../shared/utils/funnels";
import { sites } from "./sites";

export const funnels = sqliteTable("funnels", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	name: text().notNull(),
	window: text().$type<FunnelWindow>().notNull(),
	steps: text({ mode: "json" }).$type<FunnelStep[]>().notNull(),
	createdAt: integer().notNull(),
	updatedAt: integer().notNull(),
}, table => [
	index("idx_funnels_site").on(table.siteId, table.createdAt),
]);
