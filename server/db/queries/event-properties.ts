import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "hub:db";
import type { EventProperties, EventProperty, Site } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { inMatchingVisit } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const { events } = tables;

const KEY_LIMIT = 20;
const VALUE_LIMIT = 10;
const VALUE_ROW_LIMIT = 1000;

const property = sql.raw("property");
// json_each gives booleans as 1 and 0, so they are named by their JSON type instead.
const propertyValue = sql<string>`CASE ${property}.type WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN 'null' ELSE CAST(${property}.value AS TEXT) END`;
const propertyKey = sql<string>`${property}.key`;
const eachProperty = sql`json_each(${events.props}) AS ${property}`;

function pathCondition(path: string | undefined) {
	if (path === undefined) {
		return undefined;
	}
	return path === "" ? isNull(events.path) : eq(events.path, path);
}

// Properties are never rolled up, so every Range reads raw rows (kept for 3 years, ADR 0004).
export async function computeEventProperties(site: Site, range: ResolvedRange, filters: Filter[], name: string, path?: string): Promise<EventProperties> {
	const empty = { name, path: path ?? null, count: 0, properties: [] };
	const rawWindow = rawWindowOfPlan(planRangeQuery(range, site.timezone), site.timezone);
	if (!rawWindow) {
		return empty;
	}
	const matching = and(
		eq(events.siteId, site.id),
		eq(events.name, name),
		gte(events.timestamp, rawWindow.startSec),
		lt(events.timestamp, rawWindow.endSec),
		pathCondition(path),
		inMatchingVisit(events.visitId, filters),
	);

	const [[total], keyRows, valueRows] = await Promise.all([
		db.select({ count: sql<number>`COUNT(*)` }).from(events).where(matching),
		db.select({ key: propertyKey, count: sql<number>`COUNT(*)` })
			.from(events)
			.innerJoin(eachProperty, sql`1`)
			.where(matching)
			.groupBy(propertyKey)
			.orderBy(sql`COUNT(*) DESC`, propertyKey)
			.limit(KEY_LIMIT),
		db.select({ key: propertyKey, value: propertyValue, count: sql<number>`COUNT(*)` })
			.from(events)
			.innerJoin(eachProperty, sql`1`)
			.where(matching)
			.groupBy(propertyKey, propertyValue)
			.orderBy(sql`COUNT(*) DESC`, propertyValue)
			.limit(VALUE_ROW_LIMIT),
	]);

	const properties: EventProperty[] = keyRows.map(row => ({
		key: row.key,
		count: Number(row.count),
		values: valueRows
			.filter(valueRow => valueRow.key === row.key)
			.slice(0, VALUE_LIMIT)
			.map(valueRow => ({ value: valueRow.value, count: Number(valueRow.count) })),
	}));
	return { ...empty, count: Number(total?.count ?? 0), properties };
}
