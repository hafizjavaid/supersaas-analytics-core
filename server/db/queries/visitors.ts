import { and, asc, desc, eq, exists, gte, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias, QueryBuilder } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { JourneyStep, JourneyVisit, Site, VisitorDevice, VisitorJourney, VisitorList, VisitorPlace, VisitorProfile, VisitorRow, VisitorSource } from "#layers/core/shared/types/analytics";
import { countryCodesMatching } from "#layers/core/shared/utils/countries";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { labelSearchTerm, visitorLabel } from "#layers/core/shared/utils/visitors";
import { inValues, visitMatches } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const { devices, events, locations, outboundLinks, pages, sources, visitors, visits } = tables;

const ROW_LIMIT = 100;
const JOURNEY_LIMIT = 30;

// Must match the casing NuxtHub gives `db`, or subqueries name columns in camelCase.
const subquery = new QueryBuilder({ casing: "snake_case" });
const searchVisits = alias(visits, "search_visits");
const searchPages = alias(pages, "search_pages");
const searchLocations = alias(locations, "search_locations");

// An Identified visitor is labelled by its identify hash, so it keeps one label across days.
const labelSource = sql<string>`COALESCE(${visitors.identityHash}, ${visitors.id})`;

// Mirrors visitorNumber in shared/utils/visitors.ts: hex a-f become 0-5.
const visitorNumberSql = ["a", "b", "c", "d", "e", "f"].reduce<SQL>(
	(expression, letter, index) => sql`REPLACE(${expression}, ${sql.raw(`'${letter}'`)}, ${sql.raw(`'${index}'`)})`,
	sql`lower(substr(${labelSource}, 1, 6))`,
);

const durationSeconds = sql<number>`COALESCE(SUM(${visits.endedAt} - ${visits.startedAt}), 0)`;

const sourceColumns = {
	channel: sources.channel,
	referrerDomain: sources.referrerDomain,
	utmSource: sources.utmSource,
	utmMedium: sources.utmMedium,
	utmCampaign: sources.utmCampaign,
};

const visitDetailColumns = {
	id: visits.id,
	visitorId: visits.visitorId,
	startedAt: visits.startedAt,
	endedAt: visits.endedAt,
	pageCount: visits.pageCount,
	entryPage: visits.entryPage,
	exitPage: visits.exitPage,
	...sourceColumns,
	browser: devices.browser,
	os: devices.os,
	deviceType: devices.deviceType,
	country: locations.country,
	region: locations.region,
	city: locations.city,
};

function visitDetails(where: SQL | undefined) {
	return db.select(visitDetailColumns)
		.from(visits)
		.leftJoin(sources, eq(sources.id, visits.sourceId))
		.leftJoin(devices, eq(devices.id, visits.deviceId))
		.leftJoin(locations, eq(locations.id, visits.locationId))
		.where(where)
		.orderBy(asc(visits.startedAt));
}

type VisitDetail = Awaited<ReturnType<typeof visitDetails>>[number];

function sourceOf(visit: VisitDetail | undefined): VisitorSource | null {
	return visit?.channel
		? { channel: visit.channel, referrerDomain: visit.referrerDomain ?? "(direct)", utmSource: visit.utmSource, utmMedium: visit.utmMedium, utmCampaign: visit.utmCampaign }
		: null;
}

function deviceOf(visit: VisitDetail | undefined): VisitorDevice | null {
	return visit?.browser ? { browser: visit.browser, os: visit.os ?? "", deviceType: visit.deviceType ?? "" } : null;
}

function placeOf(visit: VisitDetail | undefined): VisitorPlace | null {
	return visit?.country ? { country: visit.country, region: visit.region || null, city: visit.city || null } : null;
}

function groupBy<TItem>(items: TItem[], keyOf: (item: TItem) => string) {
	const groups = new Map<string, TItem[]>();
	for (const item of items) {
		groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
	}
	return groups;
}

async function searchCondition(search: string): Promise<SQL | undefined> {
	if (!search) {
		return undefined;
	}
	const term = search.toLowerCase();
	const labelTerm = labelSearchTerm(search);
	const knownCountries = await db.selectDistinct({ country: locations.country }).from(locations);
	const countryCodes = countryCodesMatching(knownCountries.map(row => row.country), search);

	return or(
		sql`instr(${visitors.id}, ${term}) > 0`,
		labelTerm ? sql`instr(${visitorNumberSql}, ${labelTerm}) > 0` : undefined,
		countryCodes.length > 0
			? exists(subquery.select({ id: searchVisits.id }).from(searchVisits)
					.innerJoin(searchLocations, eq(searchLocations.id, searchVisits.locationId))
					.where(and(eq(searchVisits.visitorId, visits.visitorId), inValues(searchLocations.country, countryCodes))))
			: undefined,
		exists(subquery.select({ id: searchPages.id }).from(searchPages)
			.innerJoin(searchVisits, eq(searchVisits.id, searchPages.visitId))
			.where(and(eq(searchVisits.visitorId, visits.visitorId), sql`instr(lower(${searchPages.path}), ${term}) > 0`))),
	);
}

// Users always read raw rows, which are kept for 3 years (ADR 0004), so every Range lists its Visitors.
export async function computeVisitorList(site: Site, range: ResolvedRange, filters: Filter[], search: string): Promise<VisitorList> {
	const window = rawWindowOfPlan(planRangeQuery(range, site.timezone), site.timezone);
	if (!window) {
		return { summary: { visitors: 0, pageviews: 0, viewsPerVisitor: 0, avgTimeSeconds: 0 }, rows: [], total: 0 };
	}
	const inRange = and(eq(visits.siteId, site.id), gte(visits.startedAt, window.startSec), lt(visits.startedAt, window.endSec), visitMatches(filters));
	const matchingSearch = await searchCondition(search);

	const [summaryRow, totalRow, visitorRows] = await Promise.all([
		db.select({ visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`, pageviews: sql<number>`COALESCE(SUM(${visits.pageCount}), 0)`, durationSeconds })
			.from(visits)
			.where(inRange)
			.get(),
		db.select({ total: sql<number>`COUNT(DISTINCT ${visits.visitorId})` })
			.from(visits)
			.innerJoin(visitors, eq(visitors.id, visits.visitorId))
			.where(and(inRange, matchingSearch))
			.get(),
		db.select({
			id: visits.visitorId,
			labelSource,
			identityHash: visitors.identityHash,
			visits: sql<number>`COUNT(*)`,
			pageviews: sql<number>`SUM(${visits.pageCount})`,
			durationSeconds,
			firstSeen: sql<number>`MIN(${visits.startedAt})`,
			lastSeen: sql<number>`MAX(${visits.endedAt})`,
		})
			.from(visits)
			.innerJoin(visitors, eq(visitors.id, visits.visitorId))
			.where(and(inRange, matchingSearch))
			.groupBy(visits.visitorId)
			.orderBy(desc(sql`MAX(${visits.endedAt})`), asc(visits.visitorId))
			.limit(ROW_LIMIT),
	]);

	const shownIds = visitorRows.map(row => row.id);
	const details = shownIds.length > 0 ? groupBy(await visitDetails(and(inRange, inValues(visits.visitorId, shownIds))), visit => visit.visitorId) : new Map();

	const visitorCount = Number(summaryRow?.visitors ?? 0);
	const pageviews = Number(summaryRow?.pageviews ?? 0);
	return {
		summary: {
			visitors: visitorCount,
			pageviews,
			viewsPerVisitor: visitorCount > 0 ? pageviews / visitorCount : 0,
			avgTimeSeconds: visitorCount > 0 ? Number(summaryRow?.durationSeconds ?? 0) / visitorCount : 0,
		},
		rows: visitorRows.map((row): VisitorRow => {
			const visitorVisits: VisitDetail[] = details.get(row.id) ?? [];
			const first = visitorVisits[0];
			const last = visitorVisits.at(-1);
			return {
				id: row.id,
				label: visitorLabel(row.labelSource),
				identified: row.identityHash !== null,
				location: placeOf(last),
				source: sourceOf(first),
				device: deviceOf(last),
				visits: Number(row.visits),
				pageviews: Number(row.pageviews),
				durationSeconds: Number(row.durationSeconds),
				entryPage: first?.entryPage ?? null,
				exitPage: last?.exitPage ?? null,
				firstSeen: Number(row.firstSeen),
				lastSeen: Number(row.lastSeen),
			};
		}),
		total: Number(totalRow?.total ?? 0),
	};
}

function parseProps(props: string | null): Record<string, unknown> | null {
	if (!props) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(props);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
	}
	catch {
		return null;
	}
}

// Outbound links carry no Visit, so each joins the last Visit that started before it.
function visitAt(visitorVisits: VisitDetail[], timestamp: number) {
	return visitorVisits.findLast(visit => visit.startedAt <= timestamp) ?? visitorVisits[0];
}

const STEP_ORDER: Record<JourneyStep["type"], number> = { pageview: 0, event: 1, outbound: 2 };

// Not narrowed by the Range or Filters: the drawer shows the whole of each day. An Identified visitor's days are capped at the newest thirty.
export async function computeVisitorProfile(site: Site, visitorId: string): Promise<VisitorProfile | null> {
	const visitor = await db.select({ id: visitors.id, identityHash: visitors.identityHash })
		.from(visitors)
		.where(and(eq(visitors.siteId, site.id), eq(visitors.id, visitorId)))
		.get();
	if (!visitor) {
		return null;
	}

	const sameIdentity = visitor.identityHash
		? await db.select({ id: visitors.id, firstSeen: visitors.firstSeen, lastSeen: visitors.lastSeen })
				.from(visitors)
				.where(and(eq(visitors.siteId, site.id), eq(visitors.identityHash, visitor.identityHash)))
				.orderBy(desc(visitors.firstSeen))
				.limit(JOURNEY_LIMIT)
		: [];
	const days = sameIdentity.some(day => day.id === visitor.id)
		? sameIdentity
		: [...sameIdentity, ...await db.select({ id: visitors.id, firstSeen: visitors.firstSeen, lastSeen: visitors.lastSeen }).from(visitors).where(eq(visitors.id, visitor.id))];
	const visitorIds = days.map(day => day.id);
	const ofVisitors = and(eq(visits.siteId, site.id), inValues(visits.visitorId, visitorIds));

	const [visitRows, pageRows, eventRows, outboundRows] = await Promise.all([
		visitDetails(ofVisitors),
		db.select({ id: pages.id, visitId: pages.visitId, visitorId: visits.visitorId, path: pages.path, title: pages.title, timestamp: pages.timestamp })
			.from(pages)
			.innerJoin(visits, eq(visits.id, pages.visitId))
			.where(ofVisitors)
			.orderBy(asc(pages.timestamp), asc(pages.id)),
		db.select({ visitId: events.visitId, visitorId: visits.visitorId, name: events.name, path: events.path, props: events.props, timestamp: events.timestamp })
			.from(events)
			.innerJoin(visits, eq(visits.id, events.visitId))
			.where(ofVisitors)
			.orderBy(asc(events.timestamp), asc(events.id)),
		db.select({ visitorId: outboundLinks.visitorId, url: outboundLinks.url, timestamp: outboundLinks.timestamp })
			.from(outboundLinks)
			.where(and(eq(outboundLinks.siteId, site.id), inValues(outboundLinks.visitorId, visitorIds)))
			.orderBy(asc(outboundLinks.timestamp), asc(outboundLinks.id)),
	]);

	const visitsByVisitor = groupBy(visitRows, visit => visit.visitorId);
	const pagesByVisitor = groupBy(pageRows, page => page.visitorId);
	const eventsByVisitor = groupBy(eventRows, event => event.visitorId);
	const outboundByVisitor = groupBy(outboundRows, link => link.visitorId);

	const journeys = days.map((day): VisitorJourney => {
		const dayVisits = visitsByVisitor.get(day.id) ?? [];
		const pageviewSteps = Array.from(groupBy(pagesByVisitor.get(day.id) ?? [], page => page.visitId).values()).flatMap(visitPages =>
			visitPages.map((page, index): JourneyStep => {
				const next = visitPages[index + 1];
				return { type: "pageview", visitId: page.visitId, timestamp: page.timestamp, path: page.path, title: page.title, entry: index === 0, timeOnPageSeconds: next ? next.timestamp - page.timestamp : null };
			}));
		const eventSteps = (eventsByVisitor.get(day.id) ?? []).map((event): JourneyStep =>
			({ type: "event", visitId: event.visitId, timestamp: event.timestamp, name: event.name, path: event.path, props: parseProps(event.props) }));
		const outboundSteps = (outboundByVisitor.get(day.id) ?? []).map((link): JourneyStep =>
			({ type: "outbound", visitId: visitAt(dayVisits, link.timestamp)?.id ?? null, timestamp: link.timestamp, url: link.url }));
		const last = dayVisits.at(-1);

		return {
			visitorId: day.id,
			label: visitorLabel(visitor.identityHash ?? day.id),
			firstSeen: day.firstSeen,
			lastSeen: day.lastSeen,
			location: placeOf(last),
			device: deviceOf(last),
			visits: dayVisits.map((visit): JourneyVisit => ({
				id: visit.id,
				startedAt: visit.startedAt,
				endedAt: visit.endedAt,
				pageviews: visit.pageCount,
				entryPage: visit.entryPage,
				exitPage: visit.exitPage,
				source: sourceOf(visit),
			})),
			steps: [...pageviewSteps, ...eventSteps, ...outboundSteps].sort((a, b) => a.timestamp - b.timestamp || STEP_ORDER[a.type] - STEP_ORDER[b.type]),
		};
	});

	const firstVisit = visitRows[0];
	return {
		id: visitor.id,
		label: visitorLabel(visitor.identityHash ?? visitor.id),
		identified: visitor.identityHash !== null,
		totals: {
			days: journeys.length,
			visits: visitRows.length,
			pageviews: pageRows.length,
			events: eventRows.length,
			outboundLinks: outboundRows.length,
			durationSeconds: visitRows.reduce((total, visit) => total + visit.endedAt - visit.startedAt, 0),
		},
		firstVisit: firstVisit ? { startedAt: firstVisit.startedAt, source: sourceOf(firstVisit) } : null,
		journeys,
	};
}
