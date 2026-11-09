import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { RevenueEnvironment, RevenueProviderId } from "../../../shared/utils/revenue";
import { sites } from "./sites";
import { visitors } from "./tracking";

// The id is part of the webhook URL; `webhook_secret` signs what the provider sends to it.
export const revenueConnections = sqliteTable("revenue_connections", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	provider: text().$type<RevenueProviderId>().notNull(),
	environment: text().$type<RevenueEnvironment>().notNull(),
	// Never leaves the server, like `sites.secret`.
	accessToken: text().notNull(),
	webhookSecret: text().notNull(),
	currency: text().notNull(),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_revenue_connections_site").on(table.siteId),
]);

// Amounts are in the currency's minor unit, such as cents. Customer emails are fetched from the provider, never stored.
export const payments = sqliteTable("payments", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	visitorId: text().notNull().references(() => visitors.id),
	provider: text().$type<RevenueProviderId>().notNull(),
	providerPaymentId: text().notNull(),
	providerCustomerId: text(),
	amount: integer().notNull(),
	currency: text().notNull(),
	paidAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_payments_provider_payment").on(table.siteId, table.provider, table.providerPaymentId),
	index("idx_payments_site_paid").on(table.siteId, table.paidAt),
	index("idx_payments_visitor").on(table.visitorId),
]);
