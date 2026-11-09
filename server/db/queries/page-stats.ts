import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "hub:db";
import type { PageStats, PageStatsRow, PageStatsSort, Site, SortOrder } from "#layers/core/shared/types/analytics";
import type { RangeQueryPlan, ResolvedRange } from "#layers/core/shared/utils/dates";
import { dateRangeList, daySegments, planHourlyWindow, planPreviousRangeQuery, planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import type { SearchTotals } from "#layers/core/shared/utils/search";
import { dayIndex, inMatchingVisit, inValues, planReport, visitMatches } from "#layers/core/server/db/queries/filters";
import { computeRangeSummary } from "#layers/core/server/db/queries/overview";
import { computePageRevenue, getRevenueConnection } from "#layers/core/server/db/queries/revenue";
import { computePageSearch, getSearchConnections, searchClicksBetween } from "#layers/core/server/db/queries/search";
import { tables } from "#layers/core/server/utils/database";

const { dailyPages, pages, visits } = tables;

const ROW_LIMIT = 100;

interface PageTotals {
	path: string;
	title: string | null;
	pageviews: number;
	visits: number;
	entrances: number;
	bounces: number;
	timeOnPageSeconds: number;
	timedPageviews: number;
}

export interface PageStatsOptions {
	search: string;
	sort: PageStatsSort;
	order: SortOrder;
}

// SQLite fills a bare column from the row that holds the query's single MAX(), so `title` is the latest non-empty one.
async function rollupTotals(siteId: string, bounds: { from: string; to: string }, paths?: string[]) {
	return db.select({
		path: dailyPages.path,
		title: dailyPages.title,
		titledAt: sql`MAX(CASE WHEN ${dailyPages.title} <> '' THEN ${dailyPages.date} END)`,
		pageviews: sql<number>`SUM(${dailyPages.pageviews})`,
		visits: sql<number>`SUM(${dailyPages.visits})`,
		entrances: sql<number>`SUM(${dailyPages.entrances})`,
		bounces: sql<number>`SUM(${dailyPages.bounces})`,
		timeOnPageSeconds: sql<number>`SUM(${dailyPages.timeOnPageSeconds})`,
		timedPageviews: sql<number>`SUM(${dailyPages.timedPageviews})`,
	})
		.from(dailyPages)
		.where(and(eq(dailyPages.siteId, siteId), gte(dailyPages.date, bounds.from), lte(dailyPages.date, bounds.to), inValues(dailyPages.path, paths)))
		.groupBy(dailyPages.path);
}

// The next Pageview is found before narrowing to `paths`, or every page but the last of a Visit would lose its time.
async function rawTotals(siteId: string, { startSec, endSec }: { startSec: number; endSec: number }, filters: Filter[], paths?: string[]) {
	const pageViews = db.select({
		path: pages.path,
		title: pages.title,
		visitId: pages.visitId,
		timestamp: pages.timestamp,
		nextTimestamp: sql<number | null>`LEAD(${pages.timestamp}) OVER (PARTITION BY ${pages.visitId} ORDER BY ${pages.timestamp}, ${pages.id})`.as("next_timestamp"),
	})
		.from(pages)
		.where(and(eq(pages.siteId, siteId), gte(pages.timestamp, startSec), lt(pages.timestamp, endSec)))
		.as("page_views");

	return db.select({
		path: pageViews.path,
		title: pageViews.title,
		titledAt: sql`MAX(CASE WHEN ${pageViews.title} <> '' THEN ${pageViews.timestamp} END)`,
		pageviews: sql<number>`COUNT(*)`,
		visits: sql<number>`COUNT(DISTINCT ${pageViews.visitId})`,
		entrances: sql<number>`COUNT(DISTINCT CASE WHEN ${visits.entryPage} = ${pageViews.path} THEN ${visits.id} END)`,
		bounces: sql<number>`COUNT(DISTINCT CASE WHEN ${visits.entryPage} = ${pageViews.path} AND ${visits.isBounce} = 1 THEN ${visits.id} END)`,
		timeOnPageSeconds: sql<number>`COALESCE(SUM(${pageViews.nextTimestamp} - ${pageViews.timestamp}), 0)`,
		timedPageviews: sql<number>`COUNT(${pageViews.nextTimestamp})`,
	})
		.from(pageViews)
		.innerJoin(visits, eq(visits.id, pageViews.visitId))
		.where(and(inValues(pageViews.path, paths), visitMatches(filters)))
		.groupBy(pageViews.path);
}

// Raw rows always come after the Rollup's days, so their title is the newer one.
async function pageTotals(siteId: string, plan: RangeQueryPlan, filters: Filter[], paths?: string[]): Promise<Map<string, PageTotals>> {
	const [rollupRows, rawRows] = await Promise.all([
		plan.rollupBounds ? rollupTotals(siteId, plan.rollupBounds, paths) : [],
		plan.raw ? rawTotals(siteId, plan.raw, filters, paths) : [],
	]);

	const merged = new Map<string, PageTotals>();
	for (const row of [...rollupRows, ...rawRows]) {
		const existing = merged.get(row.path);
		merged.set(row.path, {
			path: row.path,
			title: row.title || existing?.title || null,
			pageviews: (existing?.pageviews ?? 0) + Number(row.pageviews),
			visits: (existing?.visits ?? 0) + Number(row.visits),
			entrances: (existing?.entrances ?? 0) + Number(row.entrances),
			bounces: (existing?.bounces ?? 0) + Number(row.bounces),
			timeOnPageSeconds: (existing?.timeOnPageSeconds ?? 0) + Number(row.timeOnPageSeconds),
			timedPageviews: (existing?.timedPageviews ?? 0) + Number(row.timedPageviews),
		});
	}
	return merged;
}

type RankedPage = Omit<PageStatsRow, "previousVisits" | "revenue" | "search" | "trend">;

function rankedPage(totals: PageTotals): RankedPage {
	return {
		path: totals.path,
		title: totals.title,
		pageviews: totals.pageviews,
		visits: totals.visits,
		bounceRate: totals.entrances > 0 ? totals.bounces / totals.entrances : null,
		avgTimeOnPageSeconds: totals.timedPageviews > 0 ? totals.timeOnPageSeconds / totals.timedPageviews : null,
	};
}

const SORT_VALUES: Record<Exclude<PageStatsSort, "page">, (row: RankedPage) => number | null> = {
	views: row => row.pageviews,
	visits: row => row.visits,
	bounce: row => row.bounceRate,
	duration: row => row.avgTimeOnPageSeconds,
};

// Pages without a value sort last in either order, and ties fall back to the path.
function comparePages(sort: PageStatsSort, order: SortOrder) {
	const direction = order === "asc" ? 1 : -1;
	return (a: RankedPage, b: RankedPage) => {
		if (sort === "page") {
			return direction * a.path.localeCompare(b.path);
		}
		const valueA = SORT_VALUES[sort](a);
		const valueB = SORT_VALUES[sort](b);
		if (valueA === null || valueB === null) {
			return valueA === valueB ? a.path.localeCompare(b.path) : valueA === null ? 1 : -1;
		}
		return direction * (valueA - valueB) || a.path.localeCompare(b.path);
	};
}

function matchesSearch(row: RankedPage, search: string) {
	const needle = search.toLowerCase();
	return row.path.toLowerCase().includes(needle) || (row.title?.toLowerCase().includes(needle) ?? false);
}

// Single days chart by the hour, like the Overview chart. Longer Ranges chart by day: from Rollups and today's raw rows, or from raw rows alone when filtered.
async function pageTrends(site: Site, range: ResolvedRange, filters: Filter[], paths: string[], now: number): Promise<Map<string, number[]>> {
	const hourly = planHourlyWindow(range, site.timezone, now);
	const rawCount = (bucket: SQL<number>, window: { startSec: number; endSec: number }) => db.select({ path: pages.path, bucket, count: sql<number>`COUNT(*)` })
		.from(pages)
		.where(and(eq(pages.siteId, site.id), gte(pages.timestamp, window.startSec), lt(pages.timestamp, window.endSec), inValues(pages.path, paths), inMatchingVisit(pages.visitId, filters)))
		.groupBy(pages.path, bucket);

	let length: number;
	let counts: { path: string; bucket: number; count: number }[];
	if (hourly) {
		length = hourly.buckets;
		counts = await rawCount(sql<number>`CAST((${pages.timestamp} - ${hourly.firstBucketSec}) / 3600 AS INTEGER)`, hourly);
	}
	else {
		const dates = dateRangeList(range.fromDate, range.toDate);
		length = dates.length;
		const plan = planRangeQuery(range, site.timezone, now);
		if (filters.length > 0) {
			const window = rawWindowOfPlan(plan, site.timezone);
			counts = window ? await rawCount(dayIndex(pages.timestamp, daySegments(range.fromDate, range.toDate, site.timezone)), window) : [];
		}
		else {
			const dayOf = new Map(dates.map((date, index) => [date, index]));
			const [rollupRows, rawRows] = await Promise.all([
				plan.rollupBounds
					? db.select({ path: dailyPages.path, date: dailyPages.date, count: dailyPages.pageviews })
							.from(dailyPages)
							.where(and(eq(dailyPages.siteId, site.id), gte(dailyPages.date, plan.rollupBounds.from), lte(dailyPages.date, plan.rollupBounds.to), inValues(dailyPages.path, paths)))
					: [],
				plan.raw ? rawCount(sql<number>`${dayOf.get(range.today) ?? 0}`, plan.raw) : [],
			]);
			counts = [...rollupRows.map(row => ({ path: row.path, bucket: dayOf.get(row.date) ?? -1, count: row.count })), ...rawRows];
		}
	}

	const byPath = new Map(paths.map(path => [path, Array.from({ length }, () => 0)]));
	for (const row of counts) {
		const trend = byPath.get(row.path);
		const bucket = Number(row.bucket);
		if (trend && bucket >= 0 && bucket < length) {
			trend[bucket]! += Number(row.count);
		}
	}
	return byPath;
}

export async function computePageStats(site: Site, range: ResolvedRange, filters: Filter[], { search, sort, order }: PageStatsOptions): Promise<PageStats> {
	const now = Date.now();
	const plan = planReport(planRangeQuery(range, site.timezone, now), filters, site.timezone);
	const [totals, visitSummary, connection, searchConnections] = await Promise.all([
		pageTotals(site.id, plan, filters),
		computeRangeSummary(site, range, filters, now),
		getRevenueConnection(site.id),
		getSearchConnections(site.id),
	]);
	const searchConnected = searchConnections.some(searchConnection => searchConnection.property);

	const allPages = Array.from(totals.values());
	const matching = allPages.map(rankedPage).filter(row => !search || matchesSearch(row, search));
	const shown = matching.sort(comparePages(sort, order)).slice(0, ROW_LIMIT);
	const paths = shown.map(row => row.path);

	const revenueWindow = connection && rawWindowOfPlan(plan, site.timezone);
	const [searchClicks, pageSearch] = searchConnected
		? await Promise.all([searchClicksBetween(site.id, range.fromDate, range.toDate), computePageSearch(site.id, range.fromDate, range.toDate, paths)])
		: [null, new Map<string, SearchTotals>()];
	const [previous, trends, revenue] = paths.length > 0
		? await Promise.all([
				pageTotals(site.id, planReport(planPreviousRangeQuery(range, site.timezone, now), filters, site.timezone), filters, paths),
				pageTrends(site, range, filters, paths, now),
				revenueWindow ? computePageRevenue(site.id, revenueWindow, filters, connection.currency, paths) : new Map<string, number>(),
			])
		: [new Map<string, PageTotals>(), new Map<string, number[]>(), new Map<string, number>()];

	const timeOnPageSeconds = allPages.reduce((total, page) => total + page.timeOnPageSeconds, 0);
	const timedPageviews = allPages.reduce((total, page) => total + page.timedPageviews, 0);
	return {
		currency: connection?.currency ?? null,
		summary: {
			pages: allPages.length,
			pageviews: allPages.reduce((total, page) => total + page.pageviews, 0),
			visits: visitSummary.visits,
			bounceRate: visitSummary.bounceRate,
			avgTimeOnPageSeconds: timedPageviews > 0 ? timeOnPageSeconds / timedPageviews : 0,
			searchClicks,
		},
		rows: shown.map(row => ({
			...row,
			previousVisits: previous.get(row.path)?.visits ?? 0,
			revenue: connection ? revenue.get(row.path) ?? 0 : null,
			search: searchConnected ? pageSearch.get(row.path) ?? { clicks: 0, impressions: 0, position: null } : null,
			trend: trends.get(row.path) ?? [],
		})),
		total: matching.length,
	};
}
