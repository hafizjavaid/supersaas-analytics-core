import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "hub:db";
import type { Funnel, Site } from "#layers/core/shared/types/analytics";
import type { FunnelInput } from "#layers/core/shared/schemas/funnels";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import type { FunnelDefinition, FunnelHit, FunnelReport } from "#layers/core/shared/utils/funnels";
import { FUNNEL_WINDOW_SECONDS, funnelDepth, summarizeFunnel } from "#layers/core/shared/utils/funnels";
import { goalGlob } from "#layers/core/shared/utils/goals";
import { inValues, visitMatches } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const { events, funnels, pages, visitors, visits } = tables;

const funnelColumns = {
	id: funnels.id,
	name: funnels.name,
	window: funnels.window,
	steps: funnels.steps,
	createdAt: funnels.createdAt,
	updatedAt: funnels.updatedAt,
};

export function listFunnels(siteId: string): Promise<Funnel[]> {
	return db.select(funnelColumns).from(funnels).where(eq(funnels.siteId, siteId)).orderBy(asc(funnels.createdAt), asc(funnels.name));
}

export function getFunnel(siteId: string, funnelId: string): Promise<Funnel | undefined> {
	return db.select(funnelColumns).from(funnels).where(and(eq(funnels.siteId, siteId), eq(funnels.id, funnelId))).get();
}

export async function countFunnels(siteId: string) {
	const row = await db.select({ count: count() }).from(funnels).where(eq(funnels.siteId, siteId)).get();
	return row?.count ?? 0;
}

export async function createFunnel(siteId: string, input: FunnelInput): Promise<Funnel> {
	const now = Math.floor(Date.now() / 1000);
	const funnel = await db.insert(funnels)
		.values({ id: crypto.randomUUID(), siteId, ...input, createdAt: now, updatedAt: now })
		.returning(funnelColumns)
		.get();
	return funnel!;
}

export function updateFunnel(siteId: string, funnelId: string, input: FunnelInput): Promise<Funnel | undefined> {
	return db.update(funnels)
		.set({ ...input, updatedAt: Math.floor(Date.now() / 1000) })
		.where(and(eq(funnels.siteId, siteId), eq(funnels.id, funnelId)))
		.returning(funnelColumns)
		.get();
}

export async function deleteFunnel(siteId: string, funnelId: string) {
	const deleted = await db.delete(funnels).where(and(eq(funnels.siteId, siteId), eq(funnels.id, funnelId))).returning({ id: funnels.id });
	return deleted.length > 0;
}

// An Identified visitor is one person across days; anyone else is their daily Visitor id (ADR 0002).
const person = sql<string>`COALESCE(${visitors.identityHash}, ${visits.visitorId})`;

interface HitRow {
	person: string;
	timestamp: number;
	value: string;
	canEnter: number;
}

function groupByPerson(pageRows: HitRow[], eventRows: HitRow[]) {
	const hitsByPerson = new Map<string, FunnelHit[]>();
	const add = (rows: HitRow[], kind: FunnelHit["kind"]) => {
		for (const row of rows) {
			const hits = hitsByPerson.get(row.person) ?? [];
			hits.push({ timestamp: Number(row.timestamp), kind, value: row.value, canEnter: Number(row.canEnter) === 1 });
			hitsByPerson.set(row.person, hits);
		}
	};
	add(pageRows, "page");
	add(eventRows, "event");
	return hitsByPerson;
}

// Funnels always read raw rows (kept for 3 years, ADR 0004). The Range and Filters choose the Visits a person can enter
// in; later steps may happen in any of their Visits until the window ends, even after the Range.
export async function computeFunnel(site: Site, range: ResolvedRange, filters: Filter[], funnel: FunnelDefinition): Promise<FunnelReport> {
	const window = rawWindowOfPlan(planRangeQuery(range, site.timezone), site.timezone);
	if (!window) {
		return summarizeFunnel(funnel.steps, [], 0);
	}
	const windowSec = FUNNEL_WINDOW_SECONDS[funnel.window];
	const globs = [...new Set(funnel.steps.filter(step => step.kind === "page").map(step => goalGlob(step.value)))];
	const eventNames = [...new Set(funnel.steps.filter(step => step.kind === "event").map(step => step.value))];
	const entersRange = and(gte(visits.startedAt, window.startSec), lt(visits.startedAt, window.endSec), visitMatches(filters));
	const canEnter = sql<number>`CASE WHEN ${entersRange} THEN 1 ELSE 0 END`;

	const [pageRows, eventRows, totals] = await Promise.all([
		globs.length === 0
			? []
			: db.select({ person, timestamp: pages.timestamp, value: pages.path, canEnter })
					.from(pages)
					.innerJoin(visits, eq(visits.id, pages.visitId))
					.innerJoin(visitors, eq(visitors.id, visits.visitorId))
					.where(and(
						eq(pages.siteId, site.id),
						gte(pages.timestamp, window.startSec),
						lt(pages.timestamp, window.endSec + windowSec),
						sql`EXISTS (SELECT 1 FROM json_each(${JSON.stringify(globs)}) WHERE ${pages.path} GLOB value)`,
					)),
		eventNames.length === 0
			? []
			: db.select({ person, timestamp: events.timestamp, value: events.name, canEnter })
					.from(events)
					.innerJoin(visits, eq(visits.id, events.visitId))
					.innerJoin(visitors, eq(visitors.id, visits.visitorId))
					.where(and(
						eq(events.siteId, site.id),
						inValues(events.name, eventNames),
						gte(events.timestamp, window.startSec),
						lt(events.timestamp, window.endSec + windowSec),
					)),
		db.select({ visitors: sql<number>`COUNT(DISTINCT ${person})` })
			.from(visits)
			.innerJoin(visitors, eq(visitors.id, visits.visitorId))
			.where(and(eq(visits.siteId, site.id), entersRange))
			.get(),
	]);

	const depths = [...groupByPerson(pageRows, eventRows).values()].map(hits => funnelDepth(funnel.steps, windowSec, hits));
	return summarizeFunnel(funnel.steps, depths, Number(totals?.visitors ?? 0));
}
