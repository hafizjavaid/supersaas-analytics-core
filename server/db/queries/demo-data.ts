import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import { tables } from "#layers/core/server/utils/database";
import type { DemoDevice, DemoLocation, DemoPayment, DemoSearch, DemoSource, DemoTraffic } from "#layers/core/server/utils/demo-traffic";
import { sealCredential } from "#layers/core/server/utils/search";
import { hashIdentity, randomHex } from "#layers/core/server/utils/visitor-id";
import { classifyChannel } from "#layers/core/shared/utils/channels";
import type { FunnelDefinition } from "#layers/core/shared/utils/funnels";
import type { SearchEngine } from "#layers/core/shared/utils/search";
import { QUICK_GOALS } from "#layers/core/shared/utils/goals";
import { resolveDeviceId, resolveLocationId, resolveSourceId } from "./ingestion";
import { aggregateSiteDay } from "./rollup";
import { chooseSearchProperty, replaceSearchData, saveSearchCredential, saveSyncProgress } from "./search";
import { deleteSiteAnalyticsQueries, getSiteWithSecret } from "./sites";

// D1 allows at most 100 bound parameters per statement.
const MAX_PARAMETERS = 99;

function chunkedInserts<TTable extends SQLiteTable>(table: TTable, rows: TTable["$inferInsert"][]) {
	if (rows.length === 0) {
		return [];
	}
	const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMETERS / Object.keys(rows[0]!).length));
	const statements = [];
	for (let index = 0; index < rows.length; index += rowsPerStatement) {
		statements.push(db.insert(table).values(rows.slice(index, index + rowsPerStatement)));
	}
	return statements;
}

async function runInBatches(statements: ReturnType<typeof chunkedInserts>) {
	for (let index = 0; index < statements.length; index += 50) {
		const [first, ...rest] = statements.slice(index, index + 50);
		await db.batch([first!, ...rest]);
	}
}

async function lookupIds(siteId: string, traffic: DemoTraffic) {
	const sourceIds = new Map<DemoSource, number>();
	const deviceIds = new Map<DemoDevice, number>();
	const locationIds = new Map<DemoLocation, number>();
	for (const visit of traffic.rawVisits) {
		if (!sourceIds.has(visit.source)) {
			sourceIds.set(visit.source, await resolveSourceId(siteId, {
				referrerDomain: visit.source.referrerDomain,
				utmSource: visit.source.utmSource || null,
				utmMedium: visit.source.utmMedium || null,
				utmCampaign: visit.source.utmCampaign || null,
				utmTerm: visit.source.utmTerm || null,
				utmContent: visit.source.utmContent || null,
			}));
		}
		if (!deviceIds.has(visit.device)) {
			deviceIds.set(visit.device, await resolveDeviceId({ ...visit.device, deviceType: visit.device.deviceType as "desktop" | "mobile" | "tablet" }));
		}
		if (!locationIds.has(visit.location)) {
			locationIds.set(visit.location, await resolveLocationId(visit.location));
		}
	}
	return { sourceIds, deviceIds, locationIds };
}

// Replaces every analytics row of the Site; the shared device and Location rows stay.
export async function replaceWithDemoTraffic(siteId: string, timezone: string, traffic: DemoTraffic) {
	const [firstDelete, ...otherDeletes] = deleteSiteAnalyticsQueries(siteId);
	await db.batch([firstDelete!, ...otherDeletes]);

	const { sourceIds, deviceIds, locationIds } = await lookupIds(siteId, traffic);
	const { rollupDays, rawVisits, rawVisitors } = traffic;
	const { secret } = (await getSiteWithSecret(siteId))!;
	const identities = Array.from(new Set(rawVisitors.flatMap(visitor => visitor.identity ?? [])));
	const identityHashes = new Map(await Promise.all(identities.map(async identity => [identity, await hashIdentity(secret, identity)] as const)));

	await runInBatches([
		...chunkedInserts(tables.dailySummary, rollupDays.map(day => ({ siteId, date: day.date, ...day.summary }))),
		...chunkedInserts(tables.dailyPages, rollupDays.flatMap(day => day.pages.map(page => ({ siteId, date: day.date, ...page })))),
		...chunkedInserts(tables.dailySources, rollupDays.flatMap(day => day.sources.map(({ source, visits }) => ({
			siteId,
			date: day.date,
			referrerDomain: source.referrerDomain,
			utmSource: source.utmSource,
			utmMedium: source.utmMedium,
			utmCampaign: source.utmCampaign,
			utmTerm: source.utmTerm ?? "",
			utmContent: source.utmContent ?? "",
			channel: classifyChannel(source),
			visits,
		})))),
		...chunkedInserts(tables.dailyDevices, rollupDays.flatMap(day => day.devices.map(({ device, visits }) => ({
			siteId,
			date: day.date,
			deviceType: device.deviceType,
			browser: device.browser,
			os: device.os,
			visits,
		})))),
		...chunkedInserts(tables.dailyLocations, rollupDays.flatMap(day => day.locations.map(({ location, visits }) => ({
			siteId,
			date: day.date,
			country: location.country,
			region: location.region,
			city: location.city,
			visits,
		})))),
		...chunkedInserts(tables.dailyOutboundLinks, rollupDays.flatMap(day => day.outboundLinks.map(link => ({ siteId, date: day.date, ...link })))),
		...chunkedInserts(tables.dailyEvents, rollupDays.flatMap(day => day.events.map(event => ({ siteId, date: day.date, ...event })))),
		...chunkedInserts(tables.visitors, rawVisitors.map(visitor => ({
			id: visitor.id,
			siteId,
			firstSeen: visitor.firstSeen,
			lastSeen: visitor.lastSeen,
			lastLatitude: visitor.location.latitude,
			lastLongitude: visitor.location.longitude,
			identityHash: visitor.identity ? identityHashes.get(visitor.identity) : null,
		}))),
	]);

	await runInBatches([
		...chunkedInserts(tables.visits, rawVisits.map(visit => ({
			id: visit.id,
			siteId,
			visitorId: visit.visitorId,
			startedAt: visit.startedAt,
			endedAt: visit.endedAt,
			entryPage: visit.pages[0]!.path,
			exitPage: visit.pages.at(-1)!.path,
			pageCount: visit.pages.length,
			isBounce: visit.pages.length === 1,
			sourceId: sourceIds.get(visit.source)!,
			deviceId: deviceIds.get(visit.device)!,
			locationId: locationIds.get(visit.location)!,
		}))),
	]);

	await runInBatches([
		...chunkedInserts(tables.pages, rawVisits.flatMap(visit => visit.pages.map(page => ({
			siteId,
			visitId: visit.id,
			path: page.path,
			title: page.title,
			timestamp: page.timestamp,
		})))),
		...chunkedInserts(tables.events, rawVisits.flatMap(visit => visit.pages.flatMap(page => page.events.map(event => ({
			siteId,
			visitId: visit.id,
			name: event.name,
			props: event.props && JSON.stringify(event.props),
			path: page.path,
			timestamp: page.timestamp,
		}))))),
		...chunkedInserts(tables.outboundLinks, rawVisits.flatMap(visit => (visit.outboundLink
			? [{ siteId, visitorId: visit.visitorId, url: visit.outboundLink, timestamp: visit.endedAt }]
			: []))),
	]);

	for (const date of traffic.rawPastDates) {
		await aggregateSiteDay(siteId, timezone, date);
	}
}

const DEMO_GOALS = [
	{ name: "Signups", kind: "event", value: "signup" },
	{ name: "Pricing page", kind: "page", value: "/pricing" },
	{ name: "Read the docs", kind: "page", value: "/docs/*" },
	...QUICK_GOALS.map(({ name, kind, value }) => ({ name, kind, value })),
] as const;

// Goals are settings rather than analytics, so a Site keeps the ones it has and gains any demo Goal it lacks.
export async function addDemoGoals(siteId: string) {
	const createdAt = Math.floor(Date.now() / 1000);
	await db.insert(tables.goals)
		.values(DEMO_GOALS.map(goal => ({ ...goal, id: crypto.randomUUID(), siteId, createdAt })))
		.onConflictDoNothing();
}

const DEMO_FUNNELS: FunnelDefinition[] = [
	{
		name: "Pricing to signup",
		window: "24h",
		steps: [
			{ kind: "page", value: "/", label: "Home" },
			{ kind: "page", value: "/pricing", label: "Pricing" },
			{ kind: "event", value: "signup", label: "Signed up" },
		],
	},
	{
		name: "Docs onboarding",
		window: "1h",
		steps: [
			{ kind: "page", value: "/docs*", label: "Docs" },
			{ kind: "page", value: "/docs/getting-started", label: "Getting started" },
			{ kind: "event", value: "docs_search", label: "" },
		],
	},
];

// Like Goals, a Site keeps its Funnels; a demo Funnel is added only when no Funnel has its name.
export async function addDemoFunnels(siteId: string) {
	const existing = new Set((await db.select({ name: tables.funnels.name }).from(tables.funnels).where(eq(tables.funnels.siteId, siteId))).map(row => row.name));
	const missing = DEMO_FUNNELS.filter(funnel => !existing.has(funnel.name));
	if (missing.length === 0) {
		return;
	}
	const now = Math.floor(Date.now() / 1000);
	await db.insert(tables.funnels).values(missing.map((funnel, index) => ({ ...funnel, id: crypto.randomUUID(), siteId, createdAt: now + index, updatedAt: now })));
}

// Like Goals, a Site keeps its Revenue connection; without one it gets a demo connection whose token reaches no
// provider, so customer emails show as unavailable. Payments are analytics, replaced with the traffic.
export async function addDemoRevenue(siteId: string, demoPayments: DemoPayment[]) {
	await db.insert(tables.revenueConnections).values({
		id: crypto.randomUUID(),
		siteId,
		provider: "polar",
		environment: "sandbox",
		accessToken: "demo-token",
		webhookSecret: randomHex(32),
		currency: "usd",
		createdAt: Math.floor(Date.now() / 1000),
	}).onConflictDoNothing();
	const connection = (await db.select({ currency: tables.revenueConnections.currency }).from(tables.revenueConnections).where(eq(tables.revenueConnections.siteId, siteId)).get())!;
	await runInBatches(chunkedInserts(tables.payments, demoPayments.map(payment => ({
		id: crypto.randomUUID(),
		siteId,
		visitorId: payment.visitorId,
		provider: "polar" as const,
		providerPaymentId: `demo-${crypto.randomUUID()}`,
		providerCustomerId: null,
		amount: payment.amount,
		currency: connection.currency,
		paidAt: payment.paidAt,
	}))));
}

// Demo Google and Bing connections with their data already synced. Their credentials are not real, so the hourly sync
// records an error on them rather than replacing the demo data.
export async function addDemoSearch(siteId: string, domain: string, google: DemoSearch, bing: DemoSearch) {
	await addDemoSearchEngine(siteId, "google", `sc-domain:${domain}`, google);
	await addDemoSearchEngine(siteId, "bing", `https://${domain}/`, bing);
}

async function addDemoSearchEngine(siteId: string, engine: SearchEngine, property: string, search: DemoSearch) {
	const from = search.days[0]?.date;
	const to = search.days.at(-1)?.date;
	if (!from || !to) {
		return;
	}
	const connection = await saveSearchCredential(siteId, engine, await sealCredential("demo-credential"));
	const chosen = await chooseSearchProperty(connection, property);
	await replaceSearchData(chosen, { from, to }, search.days, search.rows);
	await saveSyncProgress(chosen, { syncedThrough: to, backfilledFrom: from, syncedAt: Math.floor(Date.now() / 1000) });
}
