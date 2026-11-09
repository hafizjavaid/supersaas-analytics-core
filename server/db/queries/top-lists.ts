import { and, eq, gte, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "hub:db";
import type {
	DeviceDimension,
	LocationDimension,
	PageDimension,
	Site,
	SourceDimension,
	TopDeviceRow,
	TopEventRow,
	TopListResult,
	TopLocationRow,
	TopPageRow,
	TopSourceRow,
} from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { planRangeQuery } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { aiAssistantOf, CHANNEL_LABELS, findAiAssistant, isChannel } from "#layers/core/shared/utils/channels";
import { byMatchingVisitor, inMatchingVisit, planReport, visitMatches } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const {
	dailyDevices,
	dailyEvents,
	dailyLocations,
	dailyOutboundLinks,
	dailyPages,
	dailySources,
	devices,
	events,
	locations,
	outboundLinks,
	pages,
	sources,
	visits,
} = tables;

const LIMIT = 10;
const DIRECT = "(direct)";

// `total` covers every row, not only the top ten, so a row's share of it is its share of the whole Range.
function rankRows<TRow>(rows: TRow[], value: (row: TRow) => number): TopListResult<TRow> {
	const populatedRows = rows.filter(row => value(row) > 0);
	return {
		total: populatedRows.reduce((sum, row) => sum + value(row), 0),
		rows: populatedRows.sort((a, b) => value(b) - value(a)).slice(0, LIMIT),
	};
}

function reportPlan(site: Site, range: ResolvedRange, filters: Filter[]) {
	return planReport(planRangeQuery(range, site.timezone), filters, site.timezone);
}

function addTo(merged: Map<string, number>, key: string, count: number) {
	merged.set(key, (merged.get(key) ?? 0) + count);
}

export async function computeTopPages(site: Site, range: ResolvedRange, filters: Filter[], dimension: PageDimension): Promise<TopListResult<TopPageRow>> {
	if (dimension === "outbound") {
		return computeTopOutboundLinks(site, range, filters);
	}
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const rollupMetric = { top: dailyPages.pageviews, entered: dailyPages.entrances, exited: dailyPages.exits }[dimension];
	const visitPage = dimension === "entered" ? visits.entryPage : visits.exitPage;

	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ path: dailyPages.path, count: sql<number>`SUM(${rollupMetric})` })
					.from(dailyPages)
					.where(and(eq(dailyPages.siteId, site.id), gte(dailyPages.date, rollupBounds.from), lte(dailyPages.date, rollupBounds.to)))
					.groupBy(dailyPages.path)
			: [],
		!raw
			? []
			: dimension === "top"
				? db.select({ path: pages.path, count: sql<number>`COUNT(*)` })
						.from(pages)
						.where(and(eq(pages.siteId, site.id), gte(pages.timestamp, raw.startSec), lt(pages.timestamp, raw.endSec), inMatchingVisit(pages.visitId, filters)))
						.groupBy(pages.path)
				: db.select({ path: visitPage, count: sql<number>`COUNT(*)` })
						.from(visits)
						.where(and(eq(visits.siteId, site.id), gte(visits.startedAt, raw.startSec), lt(visits.startedAt, raw.endSec), isNotNull(visitPage), visitMatches(filters)))
						.groupBy(visitPage),
	]);

	const merged = new Map<string, number>();
	for (const row of [...rollupRows, ...rawRows]) {
		if (row.path) {
			addTo(merged, row.path, Number(row.count));
		}
	}
	return rankRows(Array.from(merged, ([path, count]) => ({ path, count })), row => row.count);
}

async function computeTopOutboundLinks(site: Site, range: ResolvedRange, filters: Filter[]): Promise<TopListResult<TopPageRow>> {
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ url: dailyOutboundLinks.url, clicks: sql<number>`SUM(${dailyOutboundLinks.clicks})` })
					.from(dailyOutboundLinks)
					.where(and(eq(dailyOutboundLinks.siteId, site.id), gte(dailyOutboundLinks.date, rollupBounds.from), lte(dailyOutboundLinks.date, rollupBounds.to)))
					.groupBy(dailyOutboundLinks.url)
			: [],
		raw
			? db.select({ url: outboundLinks.url, clicks: sql<number>`COUNT(*)` })
					.from(outboundLinks)
					.where(and(
						eq(outboundLinks.siteId, site.id),
						gte(outboundLinks.timestamp, raw.startSec),
						lt(outboundLinks.timestamp, raw.endSec),
						byMatchingVisitor(outboundLinks.visitorId, filters),
					))
					.groupBy(outboundLinks.url)
			: [],
	]);

	const merged = new Map<string, number>();
	for (const row of [...rollupRows, ...rawRows]) {
		addTo(merged, row.url, Number(row.clicks));
	}
	return rankRows(Array.from(merged, ([path, count]) => ({ path, count })), row => row.count);
}

type SourceColumn = "referrerDomain" | "utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent" | "channel";
type SourceTable = typeof dailySources | typeof sources;
type SourceVisits<TColumn extends SourceColumn> = Record<TColumn, string> & { visits: number };

const UTM_COLUMNS = { campaign: "utmCampaign", medium: "utmMedium", term: "utmTerm", content: "utmContent" } as const;

async function visitsBySource<TColumn extends SourceColumn>(
	site: Site,
	range: ResolvedRange,
	filters: Filter[],
	columns: TColumn[],
	condition?: (table: SourceTable) => SQL | undefined,
): Promise<SourceVisits<TColumn>[]> {
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const pick = (table: SourceTable) => Object.fromEntries(columns.map(column => [column, table[column]])) as Record<TColumn, SourceTable[TColumn]>;

	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ ...pick(dailySources), visits: sql<number>`SUM(${dailySources.visits})` })
					.from(dailySources)
					.where(and(eq(dailySources.siteId, site.id), gte(dailySources.date, rollupBounds.from), lte(dailySources.date, rollupBounds.to), condition?.(dailySources)))
					.groupBy(...columns.map(column => dailySources[column]))
			: [],
		raw
			? db.select({ ...pick(sources), visits: sql<number>`COUNT(*)` })
					.from(visits)
					.innerJoin(sources, eq(sources.id, visits.sourceId))
					.where(and(eq(visits.siteId, site.id), gte(visits.startedAt, raw.startSec), lt(visits.startedAt, raw.endSec), condition?.(sources), visitMatches(filters)))
					.groupBy(...columns.map(column => sources[column]))
			: [],
	]);

	return ([...rollupRows, ...rawRows] as Record<string, string | number | null>[]).map(row => ({
		...Object.fromEntries(columns.map(column => [column, String(row[column] ?? "")])) as Record<TColumn, string>,
		visits: Number(row.visits),
	}));
}

function rankSources<TRow>(rows: TRow[], keyOf: (row: TRow) => string | undefined, visitsOf: (row: TRow) => number, toRow: (key: string) => Omit<TopSourceRow, "visits">) {
	const merged = new Map<string, number>();
	for (const row of rows) {
		const key = keyOf(row);
		if (key) {
			addTo(merged, key, visitsOf(row));
		}
	}
	return rankRows(Array.from(merged, ([key, count]) => ({ ...toRow(key), visits: count })), row => row.visits);
}

export async function computeTopSources(site: Site, range: ResolvedRange, filters: Filter[], dimension: SourceDimension): Promise<TopListResult<TopSourceRow>> {
	if (dimension === "channel") {
		const rows = await visitsBySource(site, range, filters, ["channel"]);
		return rankSources(rows, row => row.channel, row => row.visits, key => ({ key, label: isChannel(key) ? CHANNEL_LABELS[key] : key }));
	}
	if (dimension === "ai") {
		const rows = await visitsBySource(site, range, filters, ["referrerDomain", "utmSource"], table => eq(table.channel, "ai"));
		return rankSources(rows, row => aiAssistantOf(row)?.domain, row => row.visits, key => ({ key, label: findAiAssistant(key)!.name, referrerDomain: key }));
	}
	if (dimension === "referrer") {
		const rows = await visitsBySource(site, range, filters, ["referrerDomain"]);
		return rankSources(rows, row => row.referrerDomain, row => row.visits, key => ({ key, label: key === DIRECT ? "Direct" : key, referrerDomain: key }));
	}
	const column = UTM_COLUMNS[dimension];
	const rows = await visitsBySource(site, range, filters, [column], table => ne(table[column], ""));
	return rankSources(rows, row => row[column], row => row.visits, key => ({ key, label: key }));
}

export async function computeTopDevices(site: Site, range: ResolvedRange, filters: Filter[], dimension: DeviceDimension): Promise<TopListResult<TopDeviceRow>> {
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const rollupColumn = { browser: dailyDevices.browser, os: dailyDevices.os, device: dailyDevices.deviceType }[dimension];
	const rawColumn = { browser: devices.browser, os: devices.os, device: devices.deviceType }[dimension];

	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ value: rollupColumn, visits: sql<number>`SUM(${dailyDevices.visits})` })
					.from(dailyDevices)
					.where(and(eq(dailyDevices.siteId, site.id), gte(dailyDevices.date, rollupBounds.from), lte(dailyDevices.date, rollupBounds.to)))
					.groupBy(rollupColumn)
			: [],
		raw
			? db.select({ value: rawColumn, visits: sql<number>`COUNT(*)` })
					.from(visits)
					.innerJoin(devices, eq(devices.id, visits.deviceId))
					.where(and(eq(visits.siteId, site.id), gte(visits.startedAt, raw.startSec), lt(visits.startedAt, raw.endSec), visitMatches(filters)))
					.groupBy(rawColumn)
			: [],
	]);

	const merged = new Map<string, number>();
	for (const row of [...rollupRows, ...rawRows]) {
		if (row.value) {
			addTo(merged, row.value, Number(row.visits));
		}
	}
	return rankRows(Array.from(merged, ([value, count]) => ({ value, visits: count })), row => row.visits);
}

export async function computeTopLocations(site: Site, range: ResolvedRange, filters: Filter[], dimension: LocationDimension): Promise<TopListResult<TopLocationRow>> {
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const rollupRegion = dimension === "country" ? sql<string>`''` : dailyLocations.region;
	const rollupCity = dimension === "city" ? dailyLocations.city : sql<string>`''`;
	const rawRegion = dimension === "country" ? sql<string>`''` : locations.region;
	const rawCity = dimension === "city" ? locations.city : sql<string>`''`;

	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ country: dailyLocations.country, region: rollupRegion, city: rollupCity, visits: sql<number>`SUM(${dailyLocations.visits})` })
					.from(dailyLocations)
					.where(and(
						eq(dailyLocations.siteId, site.id),
						gte(dailyLocations.date, rollupBounds.from),
						lte(dailyLocations.date, rollupBounds.to),
						dimension === "region" ? ne(dailyLocations.region, "") : undefined,
						dimension === "city" ? ne(dailyLocations.city, "") : undefined,
					))
					.groupBy(dailyLocations.country, rollupRegion, rollupCity)
			: [],
		raw
			? db.select({ country: locations.country, region: rawRegion, city: rawCity, visits: sql<number>`COUNT(*)` })
					.from(visits)
					.innerJoin(locations, eq(locations.id, visits.locationId))
					.where(and(
						eq(visits.siteId, site.id),
						gte(visits.startedAt, raw.startSec),
						lt(visits.startedAt, raw.endSec),
						dimension === "region" ? ne(locations.region, "") : undefined,
						dimension === "city" ? ne(locations.city, "") : undefined,
						visitMatches(filters),
					))
					.groupBy(locations.country, rawRegion, rawCity)
			: [],
	]);

	const merged = new Map<string, TopLocationRow>();
	for (const row of [...rollupRows, ...rawRows]) {
		const region = dimension === "country" ? "" : (row.region ?? "");
		const city = dimension === "city" ? (row.city ?? "") : "";
		const key = `${row.country}\u0000${region}\u0000${city}`;
		merged.set(key, {
			country: row.country,
			region,
			city,
			visits: (merged.get(key)?.visits ?? 0) + Number(row.visits),
		});
	}
	return rankRows(Array.from(merged.values()), row => row.visits);
}

export async function computeTopEvents(site: Site, range: ResolvedRange, filters: Filter[]): Promise<TopEventRow[]> {
	const { rollupBounds, raw } = reportPlan(site, range, filters);
	const rawPath = sql<string>`COALESCE(${events.path}, '')`;
	const [rollupRows, rawRows] = await Promise.all([
		rollupBounds
			? db.select({ name: dailyEvents.name, path: dailyEvents.path, count: sql<number>`SUM(${dailyEvents.count})` })
					.from(dailyEvents)
					.where(and(eq(dailyEvents.siteId, site.id), gte(dailyEvents.date, rollupBounds.from), lte(dailyEvents.date, rollupBounds.to)))
					.groupBy(dailyEvents.name, dailyEvents.path)
			: [],
		raw
			? db.select({ name: events.name, path: rawPath, count: sql<number>`COUNT(*)` })
					.from(events)
					.where(and(eq(events.siteId, site.id), gte(events.timestamp, raw.startSec), lt(events.timestamp, raw.endSec), inMatchingVisit(events.visitId, filters)))
					.groupBy(events.name, rawPath)
			: [],
	]);

	const merged = new Map<string, TopEventRow>();
	for (const row of [...rollupRows, ...rawRows]) {
		const key = `${row.name}\u0000${row.path}`;
		merged.set(key, {
			name: row.name,
			path: row.path || null,
			count: (merged.get(key)?.count ?? 0) + Number(row.count),
		});
	}
	return Array.from(merged.values())
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || (a.path ?? "").localeCompare(b.path ?? ""))
		.slice(0, LIMIT);
}
