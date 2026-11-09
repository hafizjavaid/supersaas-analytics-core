import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Tier } from "../../../shared/utils/tiers";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: integer({ mode: "boolean" }).default(false).notNull(),
	image: text(),
	createdAt: integer({ mode: "timestamp_ms" }).default(nowMs).notNull(),
	updatedAt: integer({ mode: "timestamp_ms" }).default(nowMs).$onUpdate(() => new Date()).notNull(),
	role: text(),
	banned: integer({ mode: "boolean" }).default(false),
	banReason: text(),
	banExpires: integer({ mode: "timestamp_ms" }),
});

export const session = sqliteTable("session", {
	id: text().primaryKey(),
	expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
	token: text().notNull().unique(),
	createdAt: integer({ mode: "timestamp_ms" }).default(nowMs).notNull(),
	updatedAt: integer({ mode: "timestamp_ms" }).$onUpdate(() => new Date()).notNull(),
	ipAddress: text(),
	userAgent: text(),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
	impersonatedBy: text(),
	activeOrganizationId: text(),
}, table => [index("session_user_id_idx").on(table.userId)]);

export const account = sqliteTable("account", {
	id: text().primaryKey(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: integer({ mode: "timestamp_ms" }),
	refreshTokenExpiresAt: integer({ mode: "timestamp_ms" }),
	scope: text(),
	password: text(),
	createdAt: integer({ mode: "timestamp_ms" }).default(nowMs).notNull(),
	updatedAt: integer({ mode: "timestamp_ms" }).$onUpdate(() => new Date()).notNull(),
}, table => [index("account_user_id_idx").on(table.userId)]);

export const verification = sqliteTable("verification", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
	createdAt: integer({ mode: "timestamp_ms" }).default(nowMs).notNull(),
	updatedAt: integer({ mode: "timestamp_ms" }).default(nowMs).$onUpdate(() => new Date()).notNull(),
}, table => [index("verification_identifier_idx").on(table.identifier)]);

export const organization = sqliteTable("organization", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull().unique(),
	logo: text(),
	createdAt: integer({ mode: "timestamp_ms" }).notNull(),
	metadata: text(),
	// Billing is kept out of Better Auth's schema so `organization/update` cannot set it. Times are in milliseconds.
	trialEndsAt: integer(),
	// Written only by the Polar webhook. Access is decided from these, never from a checkout redirect.
	subscriptionId: text(),
	subscriptionStatus: text(),
	subscriptionInterval: text(),
	// From the Subscription's Polar product, so reading the Quota needs no Polar call.
	subscriptionTier: text().$type<Tier>(),
	subscriptionPeriodEnd: integer(),
	subscriptionCancelAtPeriodEnd: integer({ mode: "boolean" }),
	subscriptionEndedAt: integer(),
	subscriptionModifiedAt: integer(),
});

export const member = sqliteTable("member", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
	role: text().default("viewer").notNull(),
	createdAt: integer({ mode: "timestamp_ms" }).notNull(),
}, table => [
	uniqueIndex("member_organization_user_idx").on(table.organizationId, table.userId),
	index("member_user_id_idx").on(table.userId),
]);

export const invitation = sqliteTable("invitation", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	email: text().notNull(),
	role: text(),
	status: text().default("pending").notNull(),
	expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
	createdAt: integer({ mode: "timestamp_ms" }).default(nowMs).notNull(),
	inviterId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
}, table => [
	index("invitation_organization_id_idx").on(table.organizationId),
	index("invitation_email_idx").on(table.email),
]);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, { fields: [member.organizationId], references: [organization.id] }),
	user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, { fields: [invitation.organizationId], references: [organization.id] }),
	user: one(user, { fields: [invitation.inviterId], references: [user.id] }),
}));
