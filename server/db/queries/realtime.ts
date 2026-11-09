import { and, asc, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { alias, QueryBuilder } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { Realtime, RealtimeChip, RealtimePageviews, RealtimeVisitor } from "#layers/core/shared/types/analytics";
import { visitorLabel } from "#layers/core/shared/utils/visitors";
import { computeLiveVisitorsIn, inScope, isLiveVisitor } from "#layers/core/server/db/queries/live";
import type { LiveScope } from "#layers/core/server/db/queries/live";
import { tables } from "#layers/core/server/utils/database";

const { devices, locations, pages, sites, sources, visitors, visits } = tables;

export const REALTIME_MINUTES = 30;
const MINUTE_SEC = 60;
const VISITOR_LIMIT = 50;
const CHIP_LIMIT = 5;

// Must match the casing NuxtHub gives `db`, or the subquery names columns in camelCase.
const subquery = new QueryBuilder({ casing: "snake_case" });
const latestVisits = alias(visits, "latest_visits");

// Each Live visitor joins only its latest Visit, found through idx_visits_visitor.
const isLatestVisit = eq(visits.id, sql`(${subquery.select({ id: latestVisits.id })
	.from(latestVisits)
	.where(eq(latestVisits.visitorId, visitors.id))
	.orderBy(desc(latestVisits.startedAt))
	.limit(1)})`);

async function topChips(column: AnySQLiteColumn, scope: LiveScope, nowSec: number): Promise<RealtimeChip[]> {
	const count = sql<number>`COUNT(*)`;
	const rows = await db.select({ value: column, count })
		.from(visitors)
		.innerJoin(visits, isLatestVisit)
		.leftJoin(sources, eq(sources.id, visits.sourceId))
		.leftJoin(devices, eq(devices.id, visits.deviceId))
		.leftJoin(locations, eq(locations.id, visits.locationId))
		.where(and(isLiveVisitor(scope, nowSec), isNotNull(column)))
		.groupBy(column)
		.orderBy(desc(count), asc(column))
		.limit(CHIP_LIMIT);
	return rows.map(row => ({ value: String(row.value), count: Number(row.count) }));
}

async function pageviewsPerMinute(scope: LiveScope, nowSec: number): Promise<RealtimePageviews> {
	const endSec = nowSec + 1;
	const startSec = endSec - REALTIME_MINUTES * MINUTE_SEC;
	const minute = sql<number>`CAST((${pages.timestamp} - ${startSec}) / ${MINUTE_SEC} AS INTEGER)`;
	const rows = await db.select({ minute, pageviews: sql<number>`COUNT(*)` })
		.from(pages)
		.where(and(inScope(pages.siteId, scope), gte(pages.timestamp, startSec), lt(pages.timestamp, endSec)))
		.groupBy(minute);

	const byMinute = new Map(rows.map(row => [Number(row.minute), Number(row.pageviews)]));
	const points = Array.from({ length: REALTIME_MINUTES }, (_, index) => ({
		timestamp: (startSec + index * MINUTE_SEC) * 1000,
		pageviews: byMinute.get(index) ?? 0,
	}));
	return {
		total: points.reduce((sum, point) => sum + point.pageviews, 0),
		peak: Math.max(0, ...points.map(point => point.pageviews)),
		points,
	};
}

async function currentVisitors(scope: LiveScope, nowSec: number): Promise<RealtimeVisitor[]> {
	const rows = await db.select({
		id: visitors.id,
		identityHash: visitors.identityHash,
		lastSeen: visitors.lastSeen,
		latitude: visitors.lastLatitude,
		longitude: visitors.lastLongitude,
		siteId: sites.id,
		siteName: sites.name,
		siteDomain: sites.domain,
		path: visits.exitPage,
		channel: sources.channel,
		referrerDomain: sources.referrerDomain,
		utmSource: sources.utmSource,
		utmMedium: sources.utmMedium,
		utmCampaign: sources.utmCampaign,
		browser: devices.browser,
		os: devices.os,
		deviceType: devices.deviceType,
		country: locations.country,
		region: locations.region,
		city: locations.city,
	})
		.from(visitors)
		.innerJoin(visits, isLatestVisit)
		.innerJoin(sites, eq(sites.id, visitors.siteId))
		.leftJoin(sources, eq(sources.id, visits.sourceId))
		.leftJoin(devices, eq(devices.id, visits.deviceId))
		.leftJoin(locations, eq(locations.id, visits.locationId))
		.where(isLiveVisitor(scope, nowSec))
		.orderBy(desc(visitors.lastSeen), asc(visitors.id))
		.limit(VISITOR_LIMIT);

	return rows.map(row => ({
		id: row.id,
		label: visitorLabel(row.identityHash ?? row.id),
		site: { id: row.siteId, name: row.siteName, domain: row.siteDomain },
		path: row.path,
		lastSeen: row.lastSeen,
		location: row.country ? { country: row.country, region: row.region || null, city: row.city || null } : null,
		device: row.browser ? { browser: row.browser, os: row.os ?? "", deviceType: row.deviceType ?? "" } : null,
		source: row.channel
			? { channel: row.channel, referrerDomain: row.referrerDomain ?? "(direct)", utmSource: row.utmSource, utmMedium: row.utmMedium, utmCampaign: row.utmCampaign }
			: null,
		coordinates: row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
	}));
}

export async function computeRealtime(scope: LiveScope, nowSec = Math.floor(Date.now() / 1000)): Promise<Realtime> {
	const [live, pageviews, referrers, countries, deviceChips, visitorRows] = await Promise.all([
		computeLiveVisitorsIn(scope, nowSec),
		pageviewsPerMinute(scope, nowSec),
		topChips(sources.referrerDomain, scope, nowSec),
		topChips(locations.country, scope, nowSec),
		topChips(devices.deviceType, scope, nowSec),
		currentVisitors(scope, nowSec),
	]);
	return { ...live, pageviews, referrers, countries, devices: deviceChips, visitors: visitorRows };
}
