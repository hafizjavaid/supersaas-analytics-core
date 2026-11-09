import { and, between, desc, eq, exists, isNotNull, ne, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { SearchBreakdownRow, SearchBreakdowns, SearchPoint, SearchReport } from "#layers/core/shared/types/search";
import type { KeywordTotals, SearchEngine, SearchRangeKey, SearchTotals, SearchWindow, SyncChunk, SyncCursor } from "#layers/core/shared/utils/search";
import { bucketKeywords, SEARCH_RANGE_DAYS, searchWindow } from "#layers/core/shared/utils/search";
import { dateRangeList } from "#layers/core/shared/utils/dates";
import { inValues } from "#layers/core/server/db/queries/filters";
import { inOrganization } from "#layers/core/server/db/queries/sites";
import { tables } from "#layers/core/server/utils/database";

const { searchConnections, searchDays, searchRows } = tables;

export type SearchConnectionRow = typeof searchConnections.$inferSelect;

export type SearchDayInput = Omit<typeof searchDays.$inferInsert, "siteId" | "engine">;
export type SearchRowInput = Omit<typeof searchRows.$inferInsert, "id" | "siteId" | "engine">;

// Engine "all" sums every connected engine.
export type SearchEngineFilter = SearchEngine | "all";

const BREAKDOWN_LIMIT = 10;
const KEYWORD_LIMIT = 100;
// Enough to bucket a large Site's keywords without reading every long-tail query of a year.
const KEYWORD_SCAN_LIMIT = 5000;
// One JSON parameter per statement keeps inserts under D1's 100 bound parameters and its queries per invocation.
const ROWS_PER_INSERT = 1000;

export function getSearchConnections(siteId: string): Promise<SearchConnectionRow[]> {
	return db.select().from(searchConnections).where(eq(searchConnections.siteId, siteId));
}

export function getSearchConnection(siteId: string, engine: SearchEngine): Promise<SearchConnectionRow | undefined> {
	return db.select().from(searchConnections).where(and(eq(searchConnections.siteId, siteId), eq(searchConnections.engine, engine))).get();
}

export function listSyncableSearchConnections(): Promise<SearchConnectionRow[]> {
	return db.select().from(searchConnections).where(isNotNull(searchConnections.property));
}

// Reconnecting replaces the credential and keeps the property, so a renewed Google consent resumes syncing.
export function saveSearchCredential(siteId: string, engine: SearchEngine, credential: string): Promise<SearchConnectionRow> {
	return db.insert(searchConnections).values({
		id: crypto.randomUUID(),
		siteId,
		engine,
		credential,
		createdAt: Math.floor(Date.now() / 1000),
	}).onConflictDoUpdate({
		target: [searchConnections.siteId, searchConnections.engine],
		set: { credential, lastError: null },
	}).returning().get();
}

function deleteEngineData(siteId: string, engine: SearchEngine) {
	return [
		db.delete(searchDays).where(and(eq(searchDays.siteId, siteId), eq(searchDays.engine, engine))),
		db.delete(searchRows).where(and(eq(searchRows.siteId, siteId), eq(searchRows.engine, engine))),
	] as const;
}

// Another property is another website's data, so what was synced for the old one goes.
export async function chooseSearchProperty(connection: SearchConnectionRow, property: string): Promise<SearchConnectionRow> {
	if (connection.property === property) {
		return connection;
	}
	const [updated] = await db.batch([
		db.update(searchConnections)
			.set({ property, syncedThrough: null, backfilledFrom: null, syncedAt: null, lastError: null })
			.where(eq(searchConnections.id, connection.id))
			.returning(),
		...deleteEngineData(connection.siteId, connection.engine),
	]);
	return updated[0]!;
}

export async function deleteSearchConnection(siteId: string, engine: SearchEngine) {
	await db.batch([
		db.delete(searchConnections).where(and(eq(searchConnections.siteId, siteId), eq(searchConnections.engine, engine))),
		...deleteEngineData(siteId, engine),
	]);
}

// A sync still running for a property that has since been replaced or disconnected must not write: every write below
// checks the connection still reads the property the sync started with.
function stillSyncing(connection: SearchConnectionRow) {
	return and(eq(searchConnections.id, connection.id), eq(searchConnections.property, connection.property ?? ""));
}

export async function saveSyncProgress(connection: SearchConnectionRow, cursor: SyncCursor) {
	await db.update(searchConnections).set({ ...cursor, lastError: null }).where(stillSyncing(connection));
}

export async function recordSyncError(connection: SearchConnectionRow, lastError: string) {
	await db.update(searchConnections).set({ lastError }).where(stillSyncing(connection));
}

function jsonChunks(rows: unknown[][]): string[] {
	const chunks = [];
	for (let index = 0; index < rows.length; index += ROWS_PER_INSERT) {
		chunks.push(JSON.stringify(rows.slice(index, index + ROWS_PER_INSERT)));
	}
	return chunks;
}

// Replaces what an engine reported for the chunk's days in one batch, so a sync never leaves a day half written.
export async function replaceSearchData(connection: SearchConnectionRow, chunk: SyncChunk, days: SearchDayInput[], rows: SearchRowInput[]) {
	const { siteId, engine } = connection;
	const dayValues = days.map(day => [day.date, day.clicks, day.impressions, day.positionSum, day.positionedImpressions]);
	const rowValues = rows.map(row => [row.date, row.query, row.page, row.path, row.country, row.device, row.clicks, row.impressions, row.positionSum]);
	const field = (index: number) => sql.raw(`json_extract(value, '$[${index}]')`);
	// INSERT ... SELECT fills the tables' columns in their declared order: keep these selects in step with the schema.
	const guard = exists(db.select({ id: searchConnections.id }).from(searchConnections).where(stillSyncing(connection)));
	await db.batch([
		db.delete(searchDays).where(and(eq(searchDays.siteId, siteId), eq(searchDays.engine, engine), between(searchDays.date, chunk.from, chunk.to), guard)),
		db.delete(searchRows).where(and(eq(searchRows.siteId, siteId), eq(searchRows.engine, engine), between(searchRows.date, chunk.from, chunk.to), guard)),
		...jsonChunks(dayValues).map(json => db.insert(searchDays).select(
			sql`SELECT ${siteId}, ${engine}, ${field(0)}, ${field(1)}, ${field(2)}, ${field(3)}, ${field(4)} FROM json_each(${json}) WHERE ${guard}`,
		)),
		...jsonChunks(rowValues).map(json => db.insert(searchRows).select(
			sql`SELECT NULL, ${siteId}, ${engine}, ${field(0)}, ${field(1)}, ${field(2)}, ${field(3)}, ${field(4)}, ${field(5)}, ${field(6)}, ${field(7)}, ${field(8)} FROM json_each(${json}) WHERE ${guard}`,
		)),
	]);
}

function engineIs(column: AnySQLiteColumn, engine: SearchEngineFilter) {
	return engine === "all" ? undefined : eq(column, engine);
}

function totalsOf(clicks: unknown, impressions: unknown, positionSum: unknown, positionedImpressions: unknown): SearchTotals {
	const positioned = Number(positionedImpressions ?? 0);
	return {
		clicks: Number(clicks ?? 0),
		impressions: Number(impressions ?? 0),
		position: positioned > 0 ? Number(positionSum ?? 0) / positioned : null,
	};
}

export async function latestSearchDate(siteId: string, engine: SearchEngineFilter): Promise<string | null> {
	const row = await db.select({ date: sql<string | null>`MAX(${searchDays.date})` })
		.from(searchDays)
		.where(and(eq(searchDays.siteId, siteId), engineIs(searchDays.engine, engine)))
		.get();
	return row?.date ?? null;
}

async function summaryOf(siteId: string, window: SearchWindow, engine: SearchEngineFilter) {
	const inCurrent = sql`${searchDays.date} >= ${window.from}`;
	const row = await db.select({
		clicks: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchDays.clicks} END)`,
		impressions: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchDays.impressions} END)`,
		positionSum: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchDays.positionSum} END)`,
		positioned: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchDays.positionedImpressions} END)`,
		previousClicks: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchDays.clicks} END)`,
		previousImpressions: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchDays.impressions} END)`,
		previousPositionSum: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchDays.positionSum} END)`,
		previousPositioned: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchDays.positionedImpressions} END)`,
	})
		.from(searchDays)
		.where(and(eq(searchDays.siteId, siteId), engineIs(searchDays.engine, engine), between(searchDays.date, window.previousFrom, window.to)))
		.get();
	return {
		...totalsOf(row?.clicks, row?.impressions, row?.positionSum, row?.positioned),
		previous: totalsOf(row?.previousClicks, row?.previousImpressions, row?.previousPositionSum, row?.previousPositioned),
	};
}

async function pointsOf(siteId: string, window: SearchWindow, engines: SearchEngine[]): Promise<SearchPoint[]> {
	const rows = await db.select({ date: searchDays.date, engine: searchDays.engine, clicks: searchDays.clicks, impressions: searchDays.impressions })
		.from(searchDays)
		.where(and(eq(searchDays.siteId, siteId), between(searchDays.date, window.from, window.to)));
	const byKey = new Map(rows.map(row => [`${row.engine}:${row.date}`, row]));
	return engines.flatMap(engine => dateRangeList(window.from, window.to).map((date) => {
		const row = byKey.get(`${engine}:${date}`);
		return { date, engine, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 };
	}));
}

async function keywordsOf(siteId: string, window: SearchWindow, engine: SearchEngineFilter): Promise<KeywordTotals[]> {
	const inCurrent = sql`${searchRows.date} >= ${window.from}`;
	const rows = await db.select({
		query: searchRows.query,
		clicks: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchRows.clicks} ELSE 0 END)`,
		impressions: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchRows.impressions} ELSE 0 END)`,
		positionSum: sql<number>`SUM(CASE WHEN ${inCurrent} THEN ${searchRows.positionSum} ELSE 0 END)`,
		previousClicks: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchRows.clicks} ELSE 0 END)`,
		previousImpressions: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchRows.impressions} ELSE 0 END)`,
		previousPositionSum: sql<number>`SUM(CASE WHEN NOT ${inCurrent} THEN ${searchRows.positionSum} ELSE 0 END)`,
	})
		.from(searchRows)
		.where(and(eq(searchRows.siteId, siteId), engineIs(searchRows.engine, engine), between(searchRows.date, window.previousFrom, window.to), ne(searchRows.query, "")))
		.groupBy(searchRows.query)
		.orderBy(desc(sql`SUM(${searchRows.impressions})`))
		.limit(KEYWORD_SCAN_LIMIT);
	return rows.map(row => ({
		query: row.query,
		...totalsOf(row.clicks, row.impressions, row.positionSum, row.impressions),
		previous: totalsOf(row.previousClicks, row.previousImpressions, row.previousPositionSum, row.previousImpressions),
	}));
}

const BREAKDOWN_COLUMNS = {
	pages: searchRows.page,
	countries: searchRows.country,
	devices: searchRows.device,
} as const;

async function breakdownOf(siteId: string, column: AnySQLiteColumn, window: Pick<SearchWindow, "from" | "to">, engine: SearchEngineFilter, query?: string): Promise<SearchBreakdownRow[]> {
	const rows = await db.select({
		value: sql<string>`${column}`,
		clicks: sql<number>`SUM(${searchRows.clicks})`,
		impressions: sql<number>`SUM(${searchRows.impressions})`,
		positionSum: sql<number>`SUM(${searchRows.positionSum})`,
	})
		.from(searchRows)
		.where(and(
			eq(searchRows.siteId, siteId),
			engineIs(searchRows.engine, engine),
			between(searchRows.date, window.from, window.to),
			ne(column, ""),
			query === undefined ? undefined : eq(searchRows.query, query),
		))
		.groupBy(column)
		.orderBy(desc(sql`SUM(${searchRows.clicks})`), desc(sql`SUM(${searchRows.impressions})`), column)
		.limit(BREAKDOWN_LIMIT);
	return rows.map(row => ({ value: row.value, ...totalsOf(row.clicks, row.impressions, row.positionSum, row.impressions) }));
}

async function breakdownsOf(siteId: string, window: Pick<SearchWindow, "from" | "to">, engine: SearchEngineFilter, query?: string): Promise<SearchBreakdowns> {
	const [pages, countries, devices] = await Promise.all(
		Object.values(BREAKDOWN_COLUMNS).map(column => breakdownOf(siteId, column, window, engine, query)),
	);
	return { pages: pages!, countries: countries!, devices: devices! };
}

function compareKeywords(a: KeywordTotals, b: KeywordTotals) {
	return b.clicks - a.clicks || b.impressions - a.impressions || a.query.localeCompare(b.query);
}

function emptyTotals(): SearchTotals {
	return { clicks: 0, impressions: 0, position: null };
}

export interface SearchReportOptions {
	range: SearchRangeKey;
	engine: SearchEngineFilter;
	search: string;
}

// `engines` are the Site's engines with a property; the window ends at the latest day any of them reported.
export async function computeSearchReport(siteId: string, engines: SearchEngine[], { range, engine, search }: SearchReportOptions): Promise<SearchReport> {
	const latest = await latestSearchDate(siteId, engine);
	if (!latest) {
		return {
			range,
			engines,
			window: null,
			summary: { ...emptyTotals(), previous: emptyTotals() },
			points: [],
			buckets: bucketKeywords([]),
			keywords: [],
			keywordTotal: 0,
			pages: [],
			countries: [],
			devices: [],
		};
	}
	const window = searchWindow(range, latest);
	const shownEngines = engine === "all" ? engines : engines.filter(connected => connected === engine);
	const [summary, points, keywords, breakdowns] = await Promise.all([
		summaryOf(siteId, window, engine),
		pointsOf(siteId, window, shownEngines),
		keywordsOf(siteId, window, engine),
		breakdownsOf(siteId, window, engine),
	]);
	const needle = search.trim().toLowerCase();
	const matching = keywords.filter(row => row.impressions > 0 && (!needle || row.query.toLowerCase().includes(needle))).sort(compareKeywords);
	return {
		range,
		engines,
		window,
		summary,
		points,
		buckets: bucketKeywords(keywords),
		keywords: matching.slice(0, KEYWORD_LIMIT),
		keywordTotal: matching.length,
		...breakdowns,
	};
}

export async function computeKeywordDetail(siteId: string, query: string, { range, engine }: Omit<SearchReportOptions, "search">): Promise<SearchBreakdowns> {
	const latest = await latestSearchDate(siteId, engine);
	if (!latest) {
		return { pages: [], countries: [], devices: [] };
	}
	return breakdownsOf(siteId, searchWindow(range, latest), engine, query);
}

// Pages are matched by path, from every engine's page rows, over the dates the Range covers.
export async function computePageSearch(siteId: string, from: string, to: string, paths: string[]): Promise<Map<string, SearchTotals>> {
	const rows = await db.select({
		path: searchRows.path,
		clicks: sql<number>`SUM(${searchRows.clicks})`,
		impressions: sql<number>`SUM(${searchRows.impressions})`,
		positionSum: sql<number>`SUM(${searchRows.positionSum})`,
	})
		.from(searchRows)
		.where(and(eq(searchRows.siteId, siteId), between(searchRows.date, from, to), ne(searchRows.page, ""), inValues(searchRows.path, paths)))
		.groupBy(searchRows.path);
	return new Map(rows.map(row => [row.path, totalsOf(row.clicks, row.impressions, row.positionSum, row.impressions)]));
}

export async function searchClicksBetween(siteId: string, from: string, to: string): Promise<number> {
	const row = await db.select({ clicks: sql<number>`COALESCE(SUM(${searchDays.clicks}), 0)` })
		.from(searchDays)
		.where(and(eq(searchDays.siteId, siteId), between(searchDays.date, from, to)))
		.get();
	return Number(row?.clicks ?? 0);
}

export interface SiteSearchTotals {
	window: SearchWindow;
	summary: SearchTotals & { previous: SearchTotals };
	trend: number[];
}

// Each Site's window ends at its own latest day, so one grouped query over the Organization's Sites reads them all.
export async function computeOrganizationSearch(organizationId: string, range: SearchRangeKey): Promise<Map<string, SiteSearchTotals>> {
	const latestDays = db.select({ siteId: searchDays.siteId, latest: sql<string>`MAX(${searchDays.date})`.as("latest") })
		.from(searchDays)
		.where(inOrganization(searchDays.siteId, organizationId))
		.groupBy(searchDays.siteId)
		.as("latest_days");
	const rows = await db.select({
		siteId: searchDays.siteId,
		latest: latestDays.latest,
		date: searchDays.date,
		clicks: sql<number>`SUM(${searchDays.clicks})`,
		impressions: sql<number>`SUM(${searchDays.impressions})`,
		positionSum: sql<number>`SUM(${searchDays.positionSum})`,
		positionedImpressions: sql<number>`SUM(${searchDays.positionedImpressions})`,
	})
		.from(searchDays)
		.innerJoin(latestDays, eq(latestDays.siteId, searchDays.siteId))
		.where(sql`${searchDays.date} > date(${latestDays.latest}, ${`-${2 * SEARCH_RANGE_DAYS[range]} days`})`)
		.groupBy(searchDays.siteId, searchDays.date);

	const bySite = new Map<string, typeof rows>();
	for (const row of rows) {
		bySite.set(row.siteId, [...bySite.get(row.siteId) ?? [], row]);
	}
	return new Map(Array.from(bySite, ([siteId, siteRows]) => {
		const window = searchWindow(range, siteRows[0]!.latest);
		const sum = (inWindow: (date: string) => boolean) => {
			const kept = siteRows.filter(row => inWindow(row.date));
			const total = (key: "clicks" | "impressions" | "positionSum" | "positionedImpressions") => kept.reduce((sum, row) => sum + Number(row[key]), 0);
			return totalsOf(total("clicks"), total("impressions"), total("positionSum"), total("positionedImpressions"));
		};
		const clicksByDate = new Map(siteRows.map(row => [row.date, Number(row.clicks)]));
		return [siteId, {
			window,
			summary: { ...sum(date => date >= window.from), previous: sum(date => date <= window.previousTo) },
			trend: dateRangeList(window.from, window.to).map(date => clicksByDate.get(date) ?? 0),
		}];
	}));
}

export function listOrganizationSearchConnections(organizationId: string): Promise<SearchConnectionRow[]> {
	return db.select().from(searchConnections).where(inOrganization(searchConnections.siteId, organizationId));
}
