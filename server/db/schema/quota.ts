import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./auth";

// One row per Organization per UTC month (`YYYY-MM`), so the Quota resets without a job.
export const organizationUsage = sqliteTable("organization_usage", {
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	month: text().notNull(),
	used: integer().notNull().default(0),
	warningSentAt: integer(),
	reachedSentAt: integer(),
	// Ask AI questions this month, capped per Tier on Hosted (`aiQuestionLimit`).
	aiQuestions: integer().notNull().default(0),
}, table => [primaryKey({ columns: [table.organizationId, table.month] })]);
