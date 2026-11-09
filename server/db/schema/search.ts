import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SearchEngine } from "../../../shared/utils/search";
import { sites } from "./sites";

// One per Site and search engine. `property` stays null until a Search Console property or Bing site is picked.
export const searchConnections = sqliteTable("search_connections", {
	id: text().primaryKey(),
	siteId: text().notNull().references(() => sites.id),
	engine: text().$type<SearchEngine>().notNull(),
	// Google's refresh token or Bing's API key, encrypted (server/utils/secret-box.ts). Never leaves the server.
	credential: text().notNull(),
	property: text(),
	// Dates (YYYY-MM-DD) fetched so far: the newest, and the oldest the backfill reached.
	syncedThrough: text(),
	backfilledFrom: text(),
	syncedAt: integer(),
	lastError: text(),
	createdAt: integer().notNull(),
}, table => [
	uniqueIndex("idx_search_connections_site_engine").on(table.siteId, table.engine),
]);

// The engine's own daily totals, which count the anonymized queries that `search_rows` leaves out. Positions are summed
// weighted by impressions; Bing's daily totals carry no position, so `positioned_impressions` counts those that do.
export const searchDays = sqliteTable("search_days", {
	siteId: text().notNull().references(() => sites.id),
	engine: text().$type<SearchEngine>().notNull(),
	date: text().notNull(),
	clicks: integer().notNull(),
	impressions: integer().notNull(),
	positionSum: real().notNull(),
	positionedImpressions: integer().notNull(),
}, table => [
	primaryKey({ columns: [table.siteId, table.engine, table.date] }),
]);

// Google's rows break down by query, page, country and device together. Bing reports queries and pages apart, so its
// rows leave the other columns empty: a breakdown by one column reads only the rows where it is not ''.
export const searchRows = sqliteTable("search_rows", {
	id: integer().primaryKey({ autoIncrement: true }),
	siteId: text().notNull().references(() => sites.id),
	engine: text().$type<SearchEngine>().notNull(),
	date: text().notNull(),
	query: text().notNull(),
	page: text().notNull(),
	// The page's path, to match the Pages tab.
	path: text().notNull(),
	country: text().notNull(),
	device: text().notNull(),
	clicks: integer().notNull(),
	impressions: integer().notNull(),
	positionSum: real().notNull(),
}, table => [
	index("idx_search_rows_site_date").on(table.siteId, table.date),
	index("idx_search_rows_site_query").on(table.siteId, table.query),
	index("idx_search_rows_site_path").on(table.siteId, table.path, table.date),
]);
