import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { UIMessage } from "ai";
import { member, organization } from "./auth";
import { sites } from "./sites";

// Each Member sees only their own conversations. `site_id` is set for one asked from a Site's page, and null for one
// about the whole Organization.
export const aiConversations = sqliteTable("ai_conversations", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	memberId: text().notNull().references(() => member.id, { onDelete: "cascade" }),
	siteId: text().references(() => sites.id, { onDelete: "cascade" }),
	title: text().notNull(),
	createdAt: integer().notNull(),
	updatedAt: integer().notNull(),
}, table => [
	index("idx_ai_conversations_member").on(table.memberId, table.updatedAt),
]);

// `parts` keeps the AI SDK's message parts, tool calls and results included, so charts render again on reload.
export const aiMessages = sqliteTable("ai_messages", {
	id: text().primaryKey(),
	conversationId: text().notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
	role: text().$type<"user" | "assistant">().notNull(),
	parts: text({ mode: "json" }).$type<UIMessage["parts"]>().notNull(),
	createdAt: integer().notNull(),
}, table => [
	index("idx_ai_messages_conversation").on(table.conversationId, table.createdAt),
]);
