import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { LiveVisitors } from "#layers/core/shared/types/analytics";
import { inOrganization } from "#layers/core/server/db/queries/sites";
import { tables } from "#layers/core/server/utils/database";

const { visitors } = tables;

export const LIVE_WINDOW_SECONDS = 5 * 60;

export type LiveScope = { siteId: string } | { organizationId: string };

export function inScope(siteId: AnySQLiteColumn, scope: LiveScope): SQL {
	return "siteId" in scope ? eq(siteId, scope.siteId) : inOrganization(siteId, scope.organizationId);
}

export function isLiveVisitor(scope: LiveScope, nowSec: number) {
	return and(inScope(visitors.siteId, scope), gte(visitors.lastSeen, nowSec - LIVE_WINDOW_SECONDS));
}

export async function computeLiveVisitorsIn(scope: LiveScope, nowSec = Math.floor(Date.now() / 1000)): Promise<LiveVisitors> {
	const isLive = isLiveVisitor(scope, nowSec);
	const [countRow, locationRows] = await Promise.all([
		db.select({ count: sql<number>`COUNT(*)` }).from(visitors).where(isLive).get(),
		db.select({ latitude: visitors.lastLatitude, longitude: visitors.lastLongitude, count: sql<number>`COUNT(*)` })
			.from(visitors)
			.where(and(isLive, isNotNull(visitors.lastLatitude), isNotNull(visitors.lastLongitude)))
			.groupBy(visitors.lastLatitude, visitors.lastLongitude)
			.orderBy(desc(sql`COUNT(*)`)),
	]);

	return {
		count: Number(countRow?.count ?? 0),
		locations: locationRows.map(row => ({ latitude: row.latitude!, longitude: row.longitude!, count: Number(row.count) })),
	};
}

export function computeLiveVisitors(siteId: string, nowSec?: number) {
	return computeLiveVisitorsIn({ siteId }, nowSec);
}
