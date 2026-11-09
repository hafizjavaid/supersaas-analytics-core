import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GoalKind } from "../../../shared/utils/goals";
import { sites } from "./sites";

export const goals = sqliteTable("goals", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	name: text().notNull(),
	kind: text().$type<GoalKind>().notNull(),
	value: text().notNull().default(""),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_goals_site_definition").on(table.siteId, table.kind, table.value),
]);
