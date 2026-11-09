import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dailySummary = sqliteTable("daily_summary", {
	siteId: text().notNull(),
	date: text().notNull(),
	visitors: integer().notNull(),
	visits: integer().notNull(),
	pageviews: integer().notNull(),
	bounceRate: real().notNull(),
	avgDurationSeconds: real().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date] }),
]);

export const dailyPages = sqliteTable("daily_pages", {
	siteId: text().notNull(),
	date: text().notNull(),
	path: text().notNull(),
	title: text(),
	pageviews: integer().notNull(),
	visitors: integer().notNull(),
	visits: integer().notNull().default(0),
	entrances: integer().notNull().default(0),
	exits: integer().notNull().default(0),
	bounces: integer().notNull().default(0),
	// Time on page is measured to the next Pageview of the same Visit, so a Visit's last Pageview has none and is not counted in timedPageviews.
	timeOnPageSeconds: integer().notNull().default(0),
	timedPageviews: integer().notNull().default(0),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.path] }),
]);

export const dailySources = sqliteTable("daily_sources", {
	siteId: text().notNull(),
	date: text().notNull(),
	referrerDomain: text().notNull(),
	utmSource: text().notNull().default(""),
	utmMedium: text().notNull().default(""),
	utmCampaign: text().notNull().default(""),
	utmTerm: text().notNull().default(""),
	utmContent: text().notNull().default(""),
	channel: text().notNull(),
	visits: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.referrerDomain, table.utmSource, table.utmMedium, table.utmCampaign, table.utmTerm, table.utmContent] }),
]);

export const dailyDevices = sqliteTable("daily_devices", {
	siteId: text().notNull(),
	date: text().notNull(),
	deviceType: text().notNull(),
	browser: text().notNull(),
	os: text().notNull().default(""),
	visits: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.deviceType, table.browser, table.os] }),
]);

export const dailyLocations = sqliteTable("daily_locations", {
	siteId: text().notNull(),
	date: text().notNull(),
	country: text().notNull(),
	region: text().notNull().default(""),
	city: text().notNull().default(""),
	visits: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.country, table.region, table.city] }),
]);

export const dailyOutboundLinks = sqliteTable("daily_outbound_links", {
	siteId: text().notNull(),
	date: text().notNull(),
	url: text().notNull(),
	clicks: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.url] }),
]);

export const dailyEvents = sqliteTable("daily_events", {
	siteId: text().notNull(),
	date: text().notNull(),
	name: text().notNull(),
	path: text().notNull().default(""),
	count: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.date, table.name, table.path] }),
]);
