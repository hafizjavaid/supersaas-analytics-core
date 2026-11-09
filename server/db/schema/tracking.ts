import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sites } from "./sites";

export const visitors = sqliteTable("visitors", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	firstSeen: integer().notNull(),
	lastSeen: integer().notNull(),
	lastLatitude: real(),
	lastLongitude: real(),
	identityHash: text(),
}, table => [
	index("idx_visitors_site_seen").on(table.siteId, table.lastSeen),
	index("idx_visitors_site_identity").on(table.siteId, table.identityHash),
]);

// One row per UTC day, deleted once that day ends (ADR 0002).
export const dailySalts = sqliteTable("daily_salts", {
	day: text().primaryKey(),
	salt: text().notNull(),
});

export const sources = sqliteTable("sources", {
	id: integer().primaryKey({ autoIncrement: true }),
	siteId: text().notNull().references(() => sites.id),
	referrerDomain: text().notNull().default("(direct)"),
	utmSource: text(),
	utmMedium: text(),
	utmCampaign: text(),
	utmTerm: text().default(""),
	utmContent: text().default(""),
	channel: text().notNull(),
}, table => [
	uniqueIndex("idx_sources_unique").on(table.siteId, table.referrerDomain, table.utmSource, table.utmMedium, table.utmCampaign, table.utmTerm, table.utmContent),
]);

export const devices = sqliteTable("devices", {
	id: integer().primaryKey({ autoIncrement: true }),
	browser: text().notNull(),
	os: text().notNull(),
	deviceType: text().notNull(),
}, table => [
	uniqueIndex("idx_devices_unique").on(table.browser, table.os, table.deviceType),
]);

export const locations = sqliteTable("locations", {
	id: integer().primaryKey({ autoIncrement: true }),
	country: text().notNull(),
	region: text(),
	city: text(),
}, table => [
	uniqueIndex("idx_locations_unique").on(table.country, table.region, table.city),
]);

export const visits = sqliteTable("visits", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	visitorId: text().notNull().references(() => visitors.id),
	startedAt: integer().notNull(),
	endedAt: integer().notNull(),
	entryPage: text(),
	exitPage: text(),
	pageCount: integer().notNull().default(1),
	isBounce: integer({ mode: "boolean" }).notNull().default(true),
	sourceId: integer().references(() => sources.id),
	deviceId: integer().references(() => devices.id),
	locationId: integer().references(() => locations.id),
}, table => [
	index("idx_visits_site_started").on(table.siteId, table.startedAt),
	index("idx_visits_visitor").on(table.visitorId, table.startedAt),
]);

export const pages = sqliteTable("pages", {
	id: integer().primaryKey({ autoIncrement: true }),
	siteId: text().notNull().references(() => sites.id),
	visitId: text().notNull().references(() => visits.id),
	path: text().notNull(),
	title: text(),
	timestamp: integer().notNull(),
}, table => [
	index("idx_pages_site_ts").on(table.siteId, table.timestamp),
	index("idx_pages_visit").on(table.visitId),
]);

export const outboundLinks = sqliteTable("outbound_links", {
	id: integer().primaryKey({ autoIncrement: true }),
	siteId: text().notNull().references(() => sites.id),
	visitorId: text().notNull().references(() => visitors.id),
	url: text().notNull(),
	timestamp: integer().notNull(),
}, table => [
	index("idx_outbound_links_site_ts").on(table.siteId, table.timestamp),
	index("idx_outbound_links_visitor").on(table.visitorId, table.timestamp),
]);

export const events = sqliteTable("events", {
	id: integer().primaryKey({ autoIncrement: true }),
	siteId: text().notNull().references(() => sites.id),
	visitId: text().notNull().references(() => visits.id),
	name: text().notNull(),
	props: text(),
	path: text(),
	timestamp: integer().notNull(),
}, table => [
	index("idx_events_site_name_ts").on(table.siteId, table.name, table.timestamp),
	index("idx_events_visit").on(table.visitId),
]);
