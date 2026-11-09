import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { OutboundLinkBreakdownRow, OutboundLinkDetail, OutboundLinkStats, Site } from "#layers/core/shared/types/analytics";
import type { RawWindow, ResolvedRange } from "#layers/core/shared/utils/dates";
import { dateRangeList, daySegments, planHourlyWindow, planPreviousRangeQuery, planRangeQuery, rangeLengthInDays, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { byMatchingVisitor, dayIndex, inValues, visitOfOutboundLink } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

// Unique clicks, Visitors, countries and devices need each click, and the Rollup keeps only clicks per URL, so every
// figure here reads raw rows (kept 3 years, ADR 0004).

const { devices, locations, outboundLinks, pages, visits } = tables;

const ROW_LIMIT = 100;

const clickPages = alias(pages, "click_pages");

interface LinkTotals {
	url: string;
	clicks: number;
	visitors: number;
}

function clicksMatching(siteId: string, window: RawWindow, filters: Filter[], urls?: string[]) {
	return and(
		eq(outboundLinks.siteId, siteId),
		gte(outboundLinks.timestamp, window.startSec),
		lt(outboundLinks.timestamp, window.endSec),
		inValues(outboundLinks.url, urls),
		byMatchingVisitor(outboundLinks.visitorId, filters),
	);
}

async function linkTotals(siteId: string, window: RawWindow | null, filters: Filter[], urls?: string[]): Promise<Map<string, LinkTotals>> {
	if (!window) {
		return new Map();
	}
	const rows = await db.select({
		url: outboundLinks.url,
		clicks: sql<number>`COUNT(*)`,
		visitors: sql<number>`COUNT(DISTINCT ${outboundLinks.visitorId})`,
	})
		.from(outboundLinks)
		.where(clicksMatching(siteId, window, filters, urls))
		.groupBy(outboundLinks.url);
	return new Map(rows.map(row => [row.url, { url: row.url, clicks: Number(row.clicks), visitors: Number(row.visitors) }]));
}

function rangeWindow(site: Site, range: ResolvedRange, now: number) {
	return rawWindowOfPlan(planRangeQuery(range, site.timezone, now), site.timezone);
}

// Single days chart by the hour and longer Ranges by day, like the Pages tab.
async function linkTrends(site: Site, range: ResolvedRange, filters: Filter[], urls: string[], now: number): Promise<Map<string, number[]>> {
	const hourly = planHourlyWindow(range, site.timezone, now);
	let length: number;
	let window: RawWindow | null;
	let bucket: SQL<number>;
	if (hourly) {
		length = hourly.buckets;
		window = hourly;
		bucket = sql<number>`CAST((${outboundLinks.timestamp} - ${hourly.firstBucketSec}) / 3600 AS INTEGER)`;
	}
	else {
		length = dateRangeList(range.fromDate, range.toDate).length;
		window = rangeWindow(site, range, now);
		bucket = dayIndex(outboundLinks.timestamp, daySegments(range.fromDate, range.toDate, site.timezone));
	}

	const counts = window
		? await db.select({ url: outboundLinks.url, bucket, count: sql<number>`COUNT(*)` })
				.from(outboundLinks)
				.where(clicksMatching(site.id, window, filters, urls))
				.groupBy(outboundLinks.url, bucket)
		: [];

	const byUrl = new Map(urls.map(url => [url, Array.from({ length }, () => 0)]));
	for (const row of counts) {
		const trend = byUrl.get(row.url);
		const index = Number(row.bucket);
		if (trend && index >= 0 && index < length) {
			trend[index]! += Number(row.count);
		}
	}
	return byUrl;
}

export async function computeOutboundLinkStats(site: Site, range: ResolvedRange, filters: Filter[]): Promise<OutboundLinkStats> {
	const now = Date.now();
	const totals = Array.from((await linkTotals(site.id, rangeWindow(site, range, now), filters)).values());
	const shown = totals.sort((a, b) => b.clicks - a.clicks || a.url.localeCompare(b.url)).slice(0, ROW_LIMIT);
	const urls = shown.map(row => row.url);

	const [previous, trends] = urls.length > 0
		? await Promise.all([
				linkTotals(site.id, rawWindowOfPlan(planPreviousRangeQuery(range, site.timezone, now), site.timezone), filters, urls),
				linkTrends(site, range, filters, urls, now),
			])
		: [new Map<string, LinkTotals>(), new Map<string, number[]>()];

	const clicks = totals.reduce((total, link) => total + link.clicks, 0);
	return {
		summary: {
			clicks,
			uniqueClicks: totals.reduce((total, link) => total + link.visitors, 0),
			links: totals.length,
			avgClicksPerLink: totals.length > 0 ? clicks / totals.length : 0,
		},
		rows: shown.map(row => ({
			...row,
			previousVisitors: previous.get(row.url)?.visitors ?? 0,
			trend: trends.get(row.url) ?? [],
		})),
		total: totals.length,
	};
}

function addTo(breakdown: Map<string, number>, value: string | null, clicks: number) {
	if (value) {
		breakdown.set(value, (breakdown.get(value) ?? 0) + clicks);
	}
}

function ranked(breakdown: Map<string, number>): OutboundLinkBreakdownRow[] {
	return Array.from(breakdown, ([value, clicks]) => ({ value, clicks }))
		.sort((a, b) => b.clicks - a.clicks || a.value.localeCompare(b.value));
}

// One row per country, device type and clicked-from page, summed into each breakdown in JS.
async function clickBreakdowns(siteId: string, url: string, window: RawWindow, filters: Filter[]) {
	const clicks = db.select({
		visitId: sql<string | null>`${visitOfOutboundLink(outboundLinks)}`.as("click_visit_id"),
		timestamp: sql<number>`${outboundLinks.timestamp}`.as("click_timestamp"),
	})
		.from(outboundLinks)
		.where(clicksMatching(siteId, window, filters, [url]))
		.as("clicks");

	const fromPath = sql<string | null>`(${db.select({ path: clickPages.path })
		.from(clickPages)
		.where(and(eq(clickPages.visitId, clicks.visitId), lte(clickPages.timestamp, clicks.timestamp)))
		.orderBy(desc(clickPages.timestamp), desc(clickPages.id))
		.limit(1)})`;

	const rows = await db.select({ country: locations.country, deviceType: devices.deviceType, path: fromPath, clicks: sql<number>`COUNT(*)` })
		.from(clicks)
		.leftJoin(visits, eq(visits.id, clicks.visitId))
		.leftJoin(locations, eq(locations.id, visits.locationId))
		.leftJoin(devices, eq(devices.id, visits.deviceId))
		.groupBy(locations.country, devices.deviceType, fromPath);

	const countries = new Map<string, number>();
	const deviceTypes = new Map<string, number>();
	const paths = new Map<string, number>();
	for (const row of rows) {
		addTo(countries, row.country, Number(row.clicks));
		addTo(deviceTypes, row.deviceType, Number(row.clicks));
		addTo(paths, row.path, Number(row.clicks));
	}
	return { countries: ranked(countries), devices: ranked(deviceTypes), pages: ranked(paths) };
}

export async function computeOutboundLinkDetail(site: Site, range: ResolvedRange, filters: Filter[], url: string): Promise<OutboundLinkDetail> {
	const now = Date.now();
	const window = rangeWindow(site, range, now);
	const [totals, trends, breakdowns] = await Promise.all([
		linkTotals(site.id, window, filters, [url]),
		linkTrends(site, range, filters, [url], now),
		window ? clickBreakdowns(site.id, url, window, filters) : { countries: [], devices: [], pages: [] },
	]);

	const clicks = totals.get(url)?.clicks ?? 0;
	const days = range.hours ? range.hours / 24 : rangeLengthInDays(range);
	return {
		url,
		clicks,
		uniqueClicks: totals.get(url)?.visitors ?? 0,
		clicksPerDay: clicks / days,
		topCountry: breakdowns.countries[0]?.value ?? null,
		...breakdowns,
		trend: trends.get(url) ?? [],
	};
}
