import { and, desc, eq } from "drizzle-orm";
import { db } from "hub:db";
import type { GeoInfo } from "#layers/core/server/utils/geo";
import type { ParsedSource } from "#layers/core/server/utils/referrer";
import type { ParsedUserAgent } from "#layers/core/server/utils/user-agent";
import { classifyChannel } from "#layers/core/shared/utils/channels";
import { tables } from "#layers/core/server/utils/database";

const VISIT_WINDOW_SECONDS = 30 * 60;

export interface VisitorSighting {
	siteId: string;
	visitorId: string;
	nowSec: number;
	coordinates?: { latitude: number; longitude: number };
	identityHash?: string;
}

export function upsertVisitor({ siteId, visitorId, nowSec, coordinates, identityHash }: VisitorSighting) {
	const lastSeen = {
		lastSeen: nowSec,
		...(coordinates && { lastLatitude: coordinates.latitude, lastLongitude: coordinates.longitude }),
		...(identityHash && { identityHash }),
	};
	return db.insert(tables.visitors)
		.values({ id: visitorId, siteId, firstSeen: nowSec, ...lastSeen })
		.onConflictDoUpdate({ target: tables.visitors.id, set: lastSeen });
}

// SQLite unique indexes treat every NULL as distinct, so the nullable UTM columns are stored as "" to keep one row per Source.
export async function resolveSourceId(siteId: string, source: ParsedSource): Promise<number> {
	const values = {
		siteId,
		referrerDomain: source.referrerDomain,
		utmSource: source.utmSource ?? "",
		utmMedium: source.utmMedium ?? "",
		utmCampaign: source.utmCampaign ?? "",
		utmTerm: source.utmTerm ?? "",
		utmContent: source.utmContent ?? "",
	};
	await db.insert(tables.sources).values({ ...values, channel: classifyChannel(source) }).onConflictDoNothing();
	const row = await db.select({ id: tables.sources.id }).from(tables.sources).where(and(
		eq(tables.sources.siteId, values.siteId),
		eq(tables.sources.referrerDomain, values.referrerDomain),
		eq(tables.sources.utmSource, values.utmSource),
		eq(tables.sources.utmMedium, values.utmMedium),
		eq(tables.sources.utmCampaign, values.utmCampaign),
		eq(tables.sources.utmTerm, values.utmTerm),
		eq(tables.sources.utmContent, values.utmContent),
	)).get();
	return row!.id;
}

export async function resolveDeviceId(device: ParsedUserAgent): Promise<number> {
	await db.insert(tables.devices).values(device).onConflictDoNothing();
	const row = await db.select({ id: tables.devices.id }).from(tables.devices).where(and(
		eq(tables.devices.browser, device.browser),
		eq(tables.devices.os, device.os),
		eq(tables.devices.deviceType, device.deviceType),
	)).get();
	return row!.id;
}

export async function resolveLocationId(geo: GeoInfo): Promise<number> {
	const values = { country: geo.country, region: geo.region ?? "", city: geo.city ?? "" };
	await db.insert(tables.locations).values(values).onConflictDoNothing();
	const row = await db.select({ id: tables.locations.id }).from(tables.locations).where(and(
		eq(tables.locations.country, values.country),
		eq(tables.locations.region, values.region),
		eq(tables.locations.city, values.city),
	)).get();
	return row!.id;
}

export function findLatestVisit(visitorId: string) {
	return db.select().from(tables.visits)
		.where(eq(tables.visits.visitorId, visitorId))
		.orderBy(desc(tables.visits.startedAt))
		.limit(1)
		.get();
}

export interface PageviewVisit {
	siteId: string;
	visitorId: string;
	path: string;
	nowSec: number;
	sourceId: number;
	deviceId: number;
	locationId: number;
}

// The 30-minute window is measured from when the Visit started, not from its last Pageview.
export async function recordVisitPageview(input: PageviewVisit): Promise<string> {
	const latest = await findLatestVisit(input.visitorId);

	if (latest && input.nowSec - latest.startedAt < VISIT_WINDOW_SECONDS) {
		await db.update(tables.visits)
			.set({ endedAt: input.nowSec, exitPage: input.path, pageCount: latest.pageCount + 1, isBounce: false })
			.where(eq(tables.visits.id, latest.id));
		return latest.id;
	}

	const id = crypto.randomUUID();
	await db.insert(tables.visits).values({
		id,
		siteId: input.siteId,
		visitorId: input.visitorId,
		startedAt: input.nowSec,
		endedAt: input.nowSec,
		entryPage: input.path,
		exitPage: input.path,
		pageCount: 1,
		isBounce: true,
		sourceId: input.sourceId,
		deviceId: input.deviceId,
		locationId: input.locationId,
	});
	return id;
}

export function insertPage(values: typeof tables.pages.$inferInsert) {
	return db.insert(tables.pages).values(values);
}

export function insertOutboundLink(values: typeof tables.outboundLinks.$inferInsert) {
	return db.insert(tables.outboundLinks).values(values);
}

export function insertEvent(values: typeof tables.events.$inferInsert) {
	return db.insert(tables.events).values(values);
}
