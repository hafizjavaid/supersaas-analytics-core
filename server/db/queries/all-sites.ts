import { and, gte, lt, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { AllSitesOverview, Money, SiteOverview, TrafficPoint, TrafficTotals } from "#layers/core/shared/types/analytics";
import { LIVE_WINDOW_SECONDS } from "#layers/core/server/db/queries/live";
import { computeOrganizationRevenue } from "#layers/core/server/db/queries/revenue";
import { computeOrganizationSearch } from "#layers/core/server/db/queries/search";
import { inOrganization, listOrganizationSites } from "#layers/core/server/db/queries/sites";
import { tables } from "#layers/core/server/utils/database";

const { pages, visitors, visits } = tables;

const HOUR_SEC = 3600;
const TREND_HOURS = 24;
const WINDOW_SEC = TREND_HOURS * HOUR_SEC;
const PREVIOUS_BUCKET = -1;

// The previous 24 hours fall in one bucket; the last 24 hours in hourly buckets 0 to 23, counted back from now rather than aligned to each Site's local hours.
function hourBucket(timestamp: AnySQLiteColumn, startSec: number) {
	return sql<number>`CASE WHEN ${timestamp} < ${startSec} THEN ${PREVIOUS_BUCKET} ELSE CAST((${timestamp} - ${startSec}) / ${HOUR_SEC} AS INTEGER) END`;
}

export async function computeAllSitesOverview(organizationId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<AllSitesOverview> {
	const endSec = nowSec + 1;
	const startSec = endSec - WINDOW_SEC;
	const previousStartSec = startSec - WINDOW_SEC;
	const visitBucket = hourBucket(visits.startedAt, startSec);
	const pageBucket = hourBucket(pages.timestamp, startSec);
	const inWindow = (siteId: AnySQLiteColumn, timestamp: AnySQLiteColumn) => and(
		inOrganization(siteId, organizationId),
		gte(timestamp, previousStartSec),
		lt(timestamp, endSec),
	);

	const [siteRows, visitorRows, hourlyVisitorRows, pageviewRows, liveRows, revenueBySite, searchBySite] = await Promise.all([
		listOrganizationSites(organizationId),
		db.select({
			siteId: visits.siteId,
			visitors: sql<number>`COUNT(DISTINCT CASE WHEN ${visits.startedAt} >= ${startSec} THEN ${visits.visitorId} END)`,
			previousVisitors: sql<number>`COUNT(DISTINCT CASE WHEN ${visits.startedAt} < ${startSec} THEN ${visits.visitorId} END)`,
		}).from(visits).where(inWindow(visits.siteId, visits.startedAt)).groupBy(visits.siteId),
		db.select({ siteId: visits.siteId, bucket: visitBucket, visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})` })
			.from(visits)
			.where(and(inOrganization(visits.siteId, organizationId), gte(visits.startedAt, startSec), lt(visits.startedAt, endSec)))
			.groupBy(visits.siteId, visitBucket),
		db.select({ siteId: pages.siteId, bucket: pageBucket, pageviews: sql<number>`COUNT(*)` })
			.from(pages)
			.where(inWindow(pages.siteId, pages.timestamp))
			.groupBy(pages.siteId, pageBucket),
		db.select({ siteId: visitors.siteId, live: sql<number>`COUNT(*)` })
			.from(visitors)
			.where(and(inOrganization(visitors.siteId, organizationId), gte(visitors.lastSeen, nowSec - LIVE_WINDOW_SECONDS)))
			.groupBy(visitors.siteId),
		computeOrganizationRevenue(organizationId, previousStartSec, startSec, endSec),
		computeOrganizationSearch(organizationId, "28d"),
	]);

	const visitorsBySite = new Map(visitorRows.map(row => [row.siteId, row]));
	const liveBySite = new Map(liveRows.map(row => [row.siteId, Number(row.live)]));
	const bucketKey = (siteId: string, bucket: number) => `${siteId}:${bucket}`;
	const hourlyVisitors = new Map(hourlyVisitorRows.map(row => [bucketKey(row.siteId, Number(row.bucket)), Number(row.visitors)]));
	const pageviews = new Map(pageviewRows.map(row => [bucketKey(row.siteId, Number(row.bucket)), Number(row.pageviews)]));

	const siteOverviews = siteRows.map((site): SiteOverview => {
		const trend: TrafficPoint[] = Array.from({ length: TREND_HOURS }, (_, hour) => ({
			timestamp: (startSec + hour * HOUR_SEC) * 1000,
			visitors: hourlyVisitors.get(bucketKey(site.id, hour)) ?? 0,
			pageviews: pageviews.get(bucketKey(site.id, hour)) ?? 0,
		}));
		const visitorRow = visitorsBySite.get(site.id);
		const revenue = revenueBySite.get(site.id);
		const search = searchBySite.get(site.id)?.summary;
		return {
			site,
			visitors: Number(visitorRow?.visitors ?? 0),
			pageviews: trend.reduce((sum, point) => sum + point.pageviews, 0),
			previous: {
				visitors: Number(visitorRow?.previousVisitors ?? 0),
				pageviews: pageviews.get(bucketKey(site.id, PREVIOUS_BUCKET)) ?? 0,
				revenue: revenue?.previousRevenue ?? 0,
				searchClicks: search?.previous.clicks ?? 0,
			},
			searchClicks: search?.clicks ?? null,
			revenue: revenue?.revenue ?? null,
			currency: revenue?.currency ?? null,
			live: liveBySite.get(site.id) ?? 0,
			trend,
		};
	});

	return { totals: { ...sumOverviews(siteOverviews), revenue: sumRevenue(siteOverviews), searchClicks: sumSearchClicks(siteOverviews) }, sites: siteOverviews };
}

function sumRevenue(siteOverviews: SiteOverview[]): Money[] {
	const byCurrency = new Map<string, number>();
	for (const { revenue, currency } of siteOverviews) {
		if (currency && revenue !== null) {
			byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + revenue);
		}
	}
	return Array.from(byCurrency, ([currency, amount]) => ({ currency, amount }));
}

function sumSearchClicks(siteOverviews: SiteOverview[]): number | null {
	const withSearch = siteOverviews.filter(entry => entry.searchClicks !== null);
	return withSearch.length > 0 ? withSearch.reduce((sum, entry) => sum + entry.searchClicks!, 0) : null;
}

// Visitor ids are per Site, so summing each Site's distinct Visitors counts nobody twice.
function sumOverviews(siteOverviews: SiteOverview[]): Omit<AllSitesOverview["totals"], "revenue" | "searchClicks"> {
	const add = (a: TrafficTotals, b: TrafficTotals) => ({ visitors: a.visitors + b.visitors, pageviews: a.pageviews + b.pageviews });
	return siteOverviews.reduce(
		(totals, entry) => ({ ...add(totals, entry), previous: add(totals.previous, entry.previous), live: totals.live + entry.live }),
		{ visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 } },
	);
}
