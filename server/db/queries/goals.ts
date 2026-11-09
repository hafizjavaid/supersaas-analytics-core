import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "hub:db";
import type { Goal, GoalReport, Site } from "#layers/core/shared/types/analytics";
import type { CreateGoalInput } from "#layers/core/shared/schemas/goals";
import type { RangeQueryPlan, RawWindow, ResolvedRange } from "#layers/core/shared/utils/dates";
import { dateRangeList, daySegments, planHourlyWindow, planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { withoutFilter } from "#layers/core/shared/utils/filters";
import { goalGlob, parseGoalFilterValue } from "#layers/core/shared/utils/goals";
import { anyGoalCondition, dayIndex, goalCondition, inValues, visitMatches, visitOfOutboundLink } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const { events, goals, outboundLinks, pages, visits } = tables;

const goalColumns = { id: goals.id, name: goals.name, kind: goals.kind, value: goals.value, createdAt: goals.createdAt };

export function listGoals(siteId: string): Promise<Goal[]> {
	return db.select(goalColumns).from(goals).where(eq(goals.siteId, siteId)).orderBy(asc(goals.createdAt), asc(goals.name));
}

export async function countGoals(siteId: string) {
	const row = await db.select({ count: count() }).from(goals).where(eq(goals.siteId, siteId)).get();
	return row?.count ?? 0;
}

// Returns undefined when the Site already has a Goal with the same definition.
export function createGoal(siteId: string, input: CreateGoalInput): Promise<Goal | undefined> {
	return db.insert(goals).values({
		id: crypto.randomUUID(),
		siteId,
		name: input.name,
		kind: input.kind,
		value: input.value,
		createdAt: Math.floor(Date.now() / 1000),
	}).onConflictDoNothing().returning(goalColumns).get();
}

export async function deleteGoal(siteId: string, goalId: string) {
	const deleted = await db.delete(goals).where(and(eq(goals.siteId, siteId), eq(goals.id, goalId))).returning({ id: goals.id });
	return deleted.length > 0;
}

// A selected Goal narrows who converted, while the rate's denominator keeps every other Filter.
function conversionParts(goalList: Goal[], filters: Filter[]) {
	const selected = filters.find(filter => filter.dimension === "goal");
	return {
		baseFilters: withoutFilter(filters, "goal"),
		converted: selected ? goalCondition(parseGoalFilterValue(selected.value)!) : anyGoalCondition(goalList),
	};
}

function visitsIn(siteId: string, { startSec, endSec }: RawWindow, filters: Filter[]) {
	return and(eq(visits.siteId, siteId), gte(visits.startedAt, startSec), lt(visits.startedAt, endSec), visitMatches(filters));
}

const rate = (converted: number, visitors: number) => visitors > 0 ? converted / visitors : 0;

async function countConverted(siteId: string, window: RawWindow, goalList: Goal[], filters: Filter[]) {
	const { baseFilters, converted } = conversionParts(goalList, filters);
	const row = await db.select({
		visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`,
		converted: sql<number>`COUNT(DISTINCT CASE WHEN ${converted} THEN ${visits.visitorId} END)`,
	}).from(visits).where(visitsIn(siteId, window, baseFilters)).get();
	return { visitors: Number(row?.visitors ?? 0), converted: Number(row?.converted ?? 0) };
}

// Goals always read raw rows (kept for 3 years, ADR 0004): a Rollup keeps no rows per Visit to match a Goal against.
export async function computeConversionRate(site: Site, plan: RangeQueryPlan, goalList: Goal[], filters: Filter[]): Promise<number | null> {
	if (goalList.length === 0) {
		return null;
	}
	const window = rawWindowOfPlan(plan, site.timezone);
	if (!window) {
		return 0;
	}
	const { visitors, converted } = await countConverted(site.id, window, goalList, filters);
	return rate(converted, visitors);
}

interface CompletionRow {
	key: string;
	conversions: number;
	visitors: number;
}

const completionCounts = {
	conversions: sql<number>`COUNT(*)`,
	visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`,
};

function countEventCompletions(siteId: string, inWindow: SQL | undefined, names: string[]): Promise<CompletionRow[]> {
	if (names.length === 0) {
		return Promise.resolve([]);
	}
	return db.select({ key: events.name, ...completionCounts })
		.from(events)
		.innerJoin(visits, eq(visits.id, events.visitId))
		.where(and(eq(events.siteId, siteId), inValues(events.name, names), inWindow))
		.groupBy(events.name);
}

// A Pageview that matches two patterns completes both Goals.
function countPageCompletions(siteId: string, inWindow: SQL | undefined, globs: string[]): Promise<CompletionRow[]> {
	if (globs.length === 0) {
		return Promise.resolve([]);
	}
	const goalGlobs = sql`json_each(${JSON.stringify(globs)}) AS goal_globs`;
	const glob = sql<string>`goal_globs.value`;
	return db.select({ key: glob, ...completionCounts })
		.from(pages)
		.innerJoin(visits, eq(visits.id, pages.visitId))
		.innerJoin(goalGlobs, sql`${pages.path} GLOB ${glob}`)
		.where(and(eq(pages.siteId, siteId), inWindow))
		.groupBy(glob);
}

function countOutboundCompletions(siteId: string, inWindow: SQL | undefined, wanted: boolean): Promise<CompletionRow[]> {
	if (!wanted) {
		return Promise.resolve([]);
	}
	return db.select({ key: sql<string>`''`, ...completionCounts })
		.from(outboundLinks)
		.innerJoin(visits, sql`${visits.id} = ${visitOfOutboundLink(outboundLinks)}`)
		.where(and(eq(outboundLinks.siteId, siteId), inWindow));
}

// The Goals card is where a Goal is chosen, so it leaves out the selected Goal and lists every Goal against the other Filters.
export async function computeGoalReport(site: Site, range: ResolvedRange, filters: Filter[]): Promise<GoalReport> {
	const goalList = await listGoals(site.id);
	const window = rawWindowOfPlan(planRangeQuery(range, site.timezone), site.timezone);
	if (goalList.length === 0 || !window) {
		return { visitors: 0, converted: 0, conversionRate: 0, goals: goalList.map(goal => ({ goal, conversions: 0, visitors: 0, conversionRate: 0 })) };
	}

	const baseFilters = withoutFilter(filters, "goal");
	const inWindow = visitsIn(site.id, window, baseFilters);
	const [totals, eventRows, pageRows, outboundRows] = await Promise.all([
		countConverted(site.id, window, goalList, baseFilters),
		countEventCompletions(site.id, inWindow, goalList.filter(goal => goal.kind === "event").map(goal => goal.value)),
		countPageCompletions(site.id, inWindow, goalList.filter(goal => goal.kind === "page").map(goal => goalGlob(goal.value))),
		countOutboundCompletions(site.id, inWindow, goalList.some(goal => goal.kind === "outbound")),
	]);

	const rowsByGoal = new Map<string, CompletionRow>([
		...eventRows.map(row => [`event:${row.key}`, row] as const),
		...pageRows.map(row => [`page:${row.key}`, row] as const),
		...outboundRows.map(row => ["outbound:", row] as const),
	]);
	const goalRows = goalList.map((goal) => {
		const row = rowsByGoal.get(`${goal.kind}:${goal.kind === "page" ? goalGlob(goal.value) : goal.value}`);
		const visitors = Number(row?.visitors ?? 0);
		return { goal, conversions: Number(row?.conversions ?? 0), visitors, conversionRate: rate(visitors, totals.visitors) };
	});

	return {
		...totals,
		conversionRate: rate(totals.converted, totals.visitors),
		goals: goalRows.sort((a, b) => b.visitors - a.visitors || b.conversions - a.conversions || a.goal.name.localeCompare(b.goal.name)),
	};
}

// One rate per Overview chart point: hours for single-day and 24-hour Ranges, otherwise the Site's local days.
export async function computeConversionPoints(site: Site, range: ResolvedRange, goalList: Goal[], filters: Filter[], now: number): Promise<number[]> {
	const hourly = planHourlyWindow(range, site.timezone, now);
	const window = hourly ?? rawWindowOfPlan(planRangeQuery(range, site.timezone, now), site.timezone);
	const length = hourly ? hourly.buckets : dateRangeList(range.fromDate, range.toDate).length;
	if (!window) {
		return Array.from({ length }, () => 0);
	}
	const bucket = hourly
		? sql<number>`CAST((${visits.startedAt} - ${hourly.firstBucketSec}) / 3600 AS INTEGER)`
		: dayIndex(visits.startedAt, daySegments(range.fromDate, range.toDate, site.timezone));

	const { baseFilters, converted } = conversionParts(goalList, filters);
	const rows = await db.select({
		bucket,
		visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`,
		converted: sql<number>`COUNT(DISTINCT CASE WHEN ${converted} THEN ${visits.visitorId} END)`,
	}).from(visits).where(visitsIn(site.id, window, baseFilters)).groupBy(bucket);

	const rates = new Map(rows.map(row => [Number(row.bucket), rate(Number(row.converted), Number(row.visitors))]));
	return Array.from({ length }, (_, index) => rates.get(index) ?? 0);
}
