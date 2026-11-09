import { and, asc, count, countDistinct, desc, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "hub:db";
import type { JourneyEvent, Journeys, JourneyStepColumn, Site } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { planRangeQuery, rawWindowOfPlan } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import type { JourneyNode } from "#layers/core/shared/utils/journeys";
import { groupStartingPoints, topJourneyNodes } from "#layers/core/shared/utils/journeys";
import { visitMatches } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";

const { events, pages, visits } = tables;

const NODES_PER_COLUMN = 25;
const STARTING_GROUPS = 30;
const EVENTS_PER_NODE = 20;

interface StepCount {
	step: number;
	path: string | null;
	visitors: number;
}

// A selected node no Visitor reached in this Range still shows, so the explorer keeps its columns.
function nodesAt(step: number, rows: StepCount[], selected: string | undefined): JourneyNode[] {
	const nodes = rows.filter(row => row.step === step && row.path !== null).map(row => ({ path: row.path!, visitors: row.visitors, selected: row.path === selected }));
	return selected === undefined || nodes.some(node => node.selected) ? nodes : [...nodes, { path: selected, visitors: 0, selected: true }];
}

// Drizzle types a CTE's columns as aliases, which comparisons do not accept; as SQL they render as the column name.
function fieldsOf<TFields extends Record<string, SQL.Aliased>>(cte: { _: { selectedFields: TFields } }) {
	const selected = cte as unknown as TFields;
	return Object.fromEntries(Object.keys(cte._.selectedFields).map(key => [key, sql`${selected[key]}`])) as { [K in keyof TFields]: TFields[K] extends SQL.Aliased<infer T> ? SQL<T> : never };
}

const total = (items: { visitors: number }[]) => items.reduce((sum, item) => sum + item.visitors, 0);

function stepColumn(step: number, rows: StepCount[], selected: string | undefined): JourneyStepColumn {
	const nodes = nodesAt(step, rows, selected);
	const exits = rows.find(row => row.step === step && row.path === null)?.visitors ?? 0;
	return { step, visitors: exits + total(nodes), nodes: topJourneyNodes(nodes, NODES_PER_COLUMN), exits };
}

function startingPointsOf(rows: StepCount[], selected: string | undefined) {
	const groups = groupStartingPoints(nodesAt(0, rows, selected));
	return [...groups.slice(0, STARTING_GROUPS), ...groups.slice(STARTING_GROUPS).filter(group => group.selected)]
		.map(group => ({ ...group, nodes: topJourneyNodes(group.nodes, NODES_PER_COLUMN) }));
}

function explorer(path: string[], rows: StepCount[], eventRows: JourneyEvent[]): Omit<Journeys, "range"> {
	return {
		visitors: total(rows.filter(row => row.step === 0)),
		path,
		startingPoints: startingPointsOf(rows, path[0]),
		steps: path.map((_, index) => stepColumn(index + 1, rows, path[index + 1])),
		events: path.length === 0 ? null : { path: path.at(-1)!, rows: eventRows },
	};
}

// Journeys read raw rows (ADR 0004). A Visitor's journey is the Pageviews of its Visits that start in the Range and match
// the Filters, in order, with a reload of the same page folded into one step. Visitor ids rotate daily, so it is one day.
export async function computeJourneys(site: Site, range: ResolvedRange, filters: Filter[], path: string[]): Promise<Omit<Journeys, "range">> {
	const window = rawWindowOfPlan(planRangeQuery(range, site.timezone), site.timezone);
	const depth = path.length;
	if (!window) {
		return explorer(path, [], []);
	}
	const inJourney = and(eq(visits.siteId, site.id), gte(visits.startedAt, window.startSec), lt(visits.startedAt, window.endSec), visitMatches(filters));

	// CTE columns render unqualified, so every name is unique across the three CTEs and the tables they join.
	const hits = db.$with("journey_hits").as(db.select({
		visitor: sql<string>`${visits.visitorId}`.as("hit_visitor"),
		path: sql<string>`${pages.path}`.as("hit_path"),
		timestamp: sql<number>`${pages.timestamp}`.as("hit_timestamp"),
		previousPath: sql<string | null>`LAG(${pages.path}) OVER (PARTITION BY ${visits.visitorId} ORDER BY ${pages.timestamp}, ${pages.id})`.as("previous_path"),
		order: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${visits.visitorId} ORDER BY ${pages.timestamp}, ${pages.id})`.as("hit_order"),
	}).from(pages).innerJoin(visits, eq(visits.id, pages.visitId)).where(inJourney));
	const hit = fieldsOf(hits);

	const steps = db.$with("journey_steps").as(db.select({
		visitor: sql<string>`${hit.visitor}`.as("step_visitor"),
		path: sql<string>`${hit.path}`.as("step_path"),
		timestamp: sql<number>`${hit.timestamp}`.as("step_timestamp"),
		nextTimestamp: sql<number | null>`LEAD(${hit.timestamp}) OVER (PARTITION BY ${hit.visitor} ORDER BY ${hit.order})`.as("next_timestamp"),
		index: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${hit.visitor} ORDER BY ${hit.order}) - 1`.as("step_index"),
	}).from(hits).where(or(isNull(hit.previousPath), ne(hit.previousPath, hit.path))));
	const step = fieldsOf(steps);

	// How many leading steps of each journey follow the selected nodes: the first step that differs, else all of them.
	const firstMismatch = sql`MIN(CASE WHEN ${step.index} < ${depth} AND ${step.path} IS NOT json_extract(${JSON.stringify(path)}, '$[' || ${step.index} || ']') THEN ${step.index} END)`;
	const journeys = db.$with("journey_depths").as(db.select({
		visitor: sql<string>`${step.visitor}`.as("journey_visitor"),
		length: sql<number>`COUNT(*)`.as("journey_length"),
		depth: sql<number>`COALESCE(${firstMismatch}, MIN(COUNT(*), ${depth}))`.as("journey_depth"),
	}).from(steps).groupBy(step.visitor));
	const journey = fieldsOf(journeys);

	const [nodeRows, exitRows, eventRows] = await Promise.all([
		db.with(hits, steps, journeys)
			.select({ step: step.index, path: step.path, visitors: count() })
			.from(steps)
			.innerJoin(journeys, eq(journey.visitor, step.visitor))
			.where(lte(step.index, journey.depth))
			.groupBy(step.index, step.path),
		depth === 0
			? []
			: db.with(hits, steps, journeys)
					.select({ step: journey.length, visitors: count() })
					.from(journeys)
					.where(and(eq(journey.length, journey.depth), gte(journey.length, 1)))
					.groupBy(journey.length),
		depth === 0
			? []
			: db.with(hits, steps, journeys)
					.select({ name: events.name, count: count(), visitors: countDistinct(step.visitor) })
					.from(events)
					.innerJoin(visits, eq(visits.id, events.visitId))
					.innerJoin(steps, and(eq(step.visitor, visits.visitorId), eq(step.index, depth - 1)))
					.innerJoin(journeys, eq(journey.visitor, step.visitor))
					.where(and(
						inJourney,
						eq(journey.depth, depth),
						eq(events.path, path[depth - 1]!),
						gte(events.timestamp, step.timestamp),
						// An Event in the same second as the next Pageview still fired on this page: its path says so.
						or(isNull(step.nextTimestamp), lte(events.timestamp, step.nextTimestamp)),
					))
					.groupBy(events.name)
					.orderBy(desc(count()), asc(events.name))
					.limit(EVENTS_PER_NODE),
	]);

	return explorer(path, [
		...nodeRows.map(row => ({ step: Number(row.step), path: row.path, visitors: Number(row.visitors) })),
		...exitRows.map(row => ({ step: Number(row.step), path: null, visitors: Number(row.visitors) })),
	], eventRows.map(row => ({ name: row.name, count: Number(row.count), visitors: Number(row.visitors) })));
}
