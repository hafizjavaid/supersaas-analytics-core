import { and, desc, eq, exists, inArray, lte, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { alias, QueryBuilder } from "drizzle-orm/sqlite-core";
import type { DaySegment, RangeQueryPlan } from "#layers/core/shared/utils/dates";
import { DAY_SEC, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { parsePlace } from "#layers/core/shared/utils/filters";
import { AI_REFERRERS, findAiAssistant } from "#layers/core/shared/utils/channels";
import type { GoalDefinition } from "#layers/core/shared/utils/goals";
import { goalGlob, parseGoalFilterValue } from "#layers/core/shared/utils/goals";
import { tables } from "#layers/core/server/utils/database";

const { devices, events, locations, outboundLinks, pages, sources, visits } = tables;

// Must match the casing NuxtHub gives `db`, or subqueries name columns in camelCase.
const subquery = new QueryBuilder({ casing: "snake_case" });
const filterPages = alias(pages, "filter_pages");
const filterEvents = alias(events, "filter_events");
const goalOutboundLinks = alias(outboundLinks, "goal_outbound_links");
const goalVisits = alias(visits, "goal_visits");

// A Rollup keeps no rows per Visit to filter, so any Filter reads the whole Range from raw rows (kept for 3 years, ADR 0004).
export function planReport(plan: RangeQueryPlan, filters: Filter[], timezone: string): RangeQueryPlan {
	if (filters.length === 0) {
		return plan;
	}
	return { rollupDates: [], rollupBounds: null, raw: rawWindowOfPlan(plan, timezone) };
}

function visitHas(table: typeof sources | typeof devices | typeof locations, foreignKey: SQLiteColumn, ...conditions: SQL[]) {
	return exists(subquery.select({ id: table.id }).from(table).where(and(eq(table.id, foreignKey), ...conditions)));
}

function placeCondition(column: typeof locations.region | typeof locations.city, value: string) {
	const place = parsePlace(value)!;
	return visitHas(locations, visits.locationId, eq(locations.country, place.country), eq(column, place.name));
}

// Mirrors aiAssistantOf: the referrer decides, and the UTM source only when the referrer is no AI assistant.
function aiAssistantCondition(domain: string) {
	const assistant = findAiAssistant(domain)!;
	return visitHas(sources, visits.sourceId, eq(sources.channel, "ai"), or(
		inArray(sources.referrerDomain, assistant.referrers),
		and(notInArray(sources.referrerDomain, AI_REFERRERS), inArray(sql`lower(${sources.utmSource})`, assistant.utmSources)),
	)!);
}

function visitHasPageview(condition: SQL | undefined) {
	return exists(subquery.select({ id: filterPages.id }).from(filterPages).where(and(eq(filterPages.visitId, visits.id), condition)));
}

function visitHasEvent(condition: SQL | undefined) {
	return exists(subquery.select({ id: filterEvents.id }).from(filterEvents).where(and(eq(filterEvents.visitId, visits.id), condition)));
}

// An Outbound link carries no Visit, so it belongs to its Visitor's latest Visit started before it, as on the Visitor journey.
export function visitOfOutboundLink(link: typeof outboundLinks | typeof goalOutboundLinks): SQL {
	return sql`(${subquery.select({ id: goalVisits.id }).from(goalVisits)
		.where(and(eq(goalVisits.visitorId, link.visitorId), lte(goalVisits.startedAt, link.timestamp)))
		.orderBy(desc(goalVisits.startedAt))
		.limit(1)})`;
}

const visitHasOutboundLink = () => exists(subquery.select({ id: goalOutboundLinks.id }).from(goalOutboundLinks).where(and(
	eq(goalOutboundLinks.visitorId, visits.visitorId),
	sql`${visitOfOutboundLink(goalOutboundLinks)} = ${visits.id}`,
)));

const pathMatchesGlobs = (globs: string[]) => sql`EXISTS (SELECT 1 FROM json_each(${JSON.stringify(globs)}) WHERE ${filterPages.path} GLOB value)`;

export function goalCondition(goal: GoalDefinition): SQL {
	switch (goal.kind) {
		case "event":
			return visitHasEvent(eq(filterEvents.name, goal.value));
		case "page":
			return visitHasPageview(sql`${filterPages.path} GLOB ${goalGlob(goal.value)}`);
		case "outbound":
			return visitHasOutboundLink();
	}
}

// Binds at most three parameters however many Goals a Site has, so it fits beside every Filter under D1's 100-parameter limit.
export function anyGoalCondition(goals: GoalDefinition[]): SQL | undefined {
	const eventNames = goals.filter(goal => goal.kind === "event").map(goal => goal.value);
	const globs = goals.filter(goal => goal.kind === "page").map(goal => goalGlob(goal.value));
	const conditions = [
		eventNames.length > 0 ? visitHasEvent(inValues(filterEvents.name, eventNames)) : undefined,
		globs.length > 0 ? visitHasPageview(pathMatchesGlobs(globs)) : undefined,
		goals.some(goal => goal.kind === "outbound") ? visitHasOutboundLink() : undefined,
	].filter(condition => condition !== undefined);
	return conditions.length > 0 ? or(...conditions) : undefined;
}

function filterCondition({ dimension, value }: Filter): SQL {
	switch (dimension) {
		case "page":
			return visitHasPageview(eq(filterPages.path, value));
		case "event":
			return visitHasEvent(eq(filterEvents.name, value));
		case "goal":
			return goalCondition(parseGoalFilterValue(value)!);
		case "entry_page":
			return eq(visits.entryPage, value);
		case "exit_page":
			return eq(visits.exitPage, value);
		case "channel":
			return visitHas(sources, visits.sourceId, eq(sources.channel, value));
		case "ai_assistant":
			return aiAssistantCondition(value);
		case "referrer":
			return visitHas(sources, visits.sourceId, eq(sources.referrerDomain, value));
		case "utm_source":
			return visitHas(sources, visits.sourceId, eq(sources.utmSource, value));
		case "utm_medium":
			return visitHas(sources, visits.sourceId, eq(sources.utmMedium, value));
		case "utm_campaign":
			return visitHas(sources, visits.sourceId, eq(sources.utmCampaign, value));
		case "utm_term":
			return visitHas(sources, visits.sourceId, eq(sources.utmTerm, value));
		case "utm_content":
			return visitHas(sources, visits.sourceId, eq(sources.utmContent, value));
		case "country":
			return visitHas(locations, visits.locationId, eq(locations.country, value));
		case "region":
			return placeCondition(locations.region, value);
		case "city":
			return placeCondition(locations.city, value);
		case "browser":
			return visitHas(devices, visits.deviceId, eq(devices.browser, value));
		case "os":
			return visitHas(devices, visits.deviceId, eq(devices.os, value));
		case "device":
			return visitHas(devices, visits.deviceId, eq(devices.deviceType, value));
	}
}

// Every Filter narrows the dashboard to the Visits that match it, and Filters combine with AND. Use where `visits` is in the FROM clause.
export function visitMatches(filters: Filter[]): SQL | undefined {
	return filters.length > 0 ? and(...filters.map(filterCondition)) : undefined;
}

// For rows that belong to a Visit, such as Pageviews and Events.
export function inMatchingVisit(visitId: SQLiteColumn, filters: Filter[]): SQL | undefined {
	return filters.length > 0
		? exists(subquery.select({ id: visits.id }).from(visits).where(and(eq(visits.id, visitId), visitMatches(filters))))
		: undefined;
}

// Outbound links carry no Visit, only the Visitor, whose id lasts one day (ADR 0002).
export function byMatchingVisitor(visitorId: SQLiteColumn, filters: Filter[]): SQL | undefined {
	return filters.length > 0
		? exists(subquery.select({ id: visits.id }).from(visits).where(and(eq(visits.visitorId, visitorId), visitMatches(filters))))
		: undefined;
}

// One bound parameter however many values, so a list stays under D1's 100-parameter limit. `undefined` adds no condition.
export function inValues(column: SQLiteColumn, values: string[] | undefined): SQL | undefined {
	return values ? sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))` : undefined;
}

// The bounds are integers computed here, inlined rather than bound so a long custom Range cannot pass D1's 100-parameter limit.
export function dayIndex(timestamp: SQLiteColumn, segments: DaySegment[]): SQL<number> {
	const integer = (value: number) => sql.raw(String(Math.trunc(value)));
	const indexIn = (segment: DaySegment) => segment.uniform
		? sql`${integer(segment.firstIndex)} + (${timestamp} - ${integer(segment.startSec)}) / ${integer(DAY_SEC)}`
		: sql`${integer(segment.firstIndex)}`;

	if (segments.length === 1) {
		return sql<number>`${indexIn(segments[0]!)}`;
	}
	const branches = segments.slice(0, -1).map((segment, index) =>
		sql`WHEN ${timestamp} < ${integer(segments[index + 1]!.startSec)} THEN ${indexIn(segment)}`);
	return sql<number>`CASE ${sql.join(branches, sql` `)} ELSE ${indexIn(segments.at(-1)!)} END`;
}
