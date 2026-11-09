import { QueryBuilder } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { anyGoalCondition, byMatchingVisitor, dayIndex, goalCondition, inMatchingVisit, planReport, visitMatches } from "#layers/core/server/db/queries/filters";
import { tables } from "#layers/core/server/utils/database";
import { daySegments } from "#layers/core/shared/utils/dates";
import type { Filter, FilterDimension } from "#layers/core/shared/utils/filters";
import { FILTER_DIMENSIONS } from "#layers/core/shared/utils/filters";

const { outboundLinks, pages, visits } = tables;
const query = new QueryBuilder({ casing: "snake_case" });

const SAMPLE_VALUES: Partial<Record<FilterDimension, string>> = {
	region: "US-Somewhere",
	city: "US-Somewhere",
	channel: "ai",
	ai_assistant: "chatgpt.com",
	goal: "page:/blog/*",
};

const EVERY_DIMENSION: Filter[] = FILTER_DIMENSIONS.map(dimension => ({
	dimension,
	value: SAMPLE_VALUES[dimension] ?? `${dimension}-value`,
}));

describe("filter conditions", () => {
	it("adds nothing without Filters", () => {
		expect(visitMatches([])).toBeUndefined();
		expect(inMatchingVisit(pages.visitId, [])).toBeUndefined();
		expect(byMatchingVisitor(outboundLinks.visitorId, [])).toBeUndefined();
	});

	it("keeps every Dimension at once far under D1's 100 parameters", () => {
		const statement = query.select({ id: pages.id }).from(pages).where(inMatchingVisit(pages.visitId, EVERY_DIMENSION)).toSQL();
		expect(statement.params.length).toBeLessThanOrEqual(60);
	});

	it("binds only the Filter value for a Dimension other than an AI assistant", () => {
		const others = EVERY_DIMENSION.filter(filter => filter.dimension !== "ai_assistant");
		const statement = query.select({ id: pages.id }).from(pages).where(inMatchingVisit(pages.visitId, others)).toSQL();
		expect(statement.params).toHaveLength(others.length + 2);
	});

	it("checks a page Filter against an aliased pages table, so it also works inside a query over pages", () => {
		const statement = query.select({ id: pages.id }).from(pages).where(inMatchingVisit(pages.visitId, [{ dimension: "page", value: "/pricing" }])).toSQL();
		expect(statement.sql).toContain("\"filter_pages\".\"visit_id\" = \"visits\".\"id\"");
		expect(statement.sql).toContain("\"visits\".\"id\" = \"pages\".\"visit_id\"");
	});

	it("matches a region by its country and name", () => {
		const statement = query.select({ id: visits.id }).from(visits).where(visitMatches([{ dimension: "region", value: "CH-BE" }])).toSQL();
		expect(statement.params).toEqual(["CH", "BE"]);
	});
});

describe("goal conditions", () => {
	it("binds at most three parameters for any number of Goals", () => {
		const goals = Array.from({ length: 50 }, (_, index) => index % 2 === 0
			? { kind: "event" as const, value: `event ${index}` }
			: { kind: "page" as const, value: `/page-${index}/*` });
		const statement = query.select({ id: visits.id }).from(visits).where(anyGoalCondition([...goals, { kind: "outbound", value: "" }])).toSQL();
		expect(statement.params).toHaveLength(3);
	});

	it("adds no condition without Goals", () => {
		expect(anyGoalCondition([])).toBeUndefined();
	});

	it("matches a page pattern with GLOB and escapes its other wildcards", () => {
		const statement = query.select({ id: visits.id }).from(visits).where(goalCondition({ kind: "page", value: "/what?" })).toSQL();
		expect(statement.sql).toContain("GLOB");
		expect(statement.params).toEqual(["/what[?]"]);
	});

	it("finds an Outbound link's Visit through aliased tables, so it also works inside a query over outbound_links", () => {
		const statement = query.select({ id: outboundLinks.id }).from(outboundLinks).where(byMatchingVisitor(outboundLinks.visitorId, [{ dimension: "goal", value: "outbound" }])).toSQL();
		expect(statement.sql).toContain("\"goal_outbound_links\".\"visitor_id\" = \"visits\".\"visitor_id\"");
		expect(statement.sql).toContain("\"goal_visits\".\"visitor_id\" = \"goal_outbound_links\".\"visitor_id\"");
		expect(statement.params).toEqual([1]);
	});
});

describe("dayIndex", () => {
	it("binds no parameters, however long the Range", () => {
		const segments = daySegments("2016-01-01", "2026-01-01", "Europe/Zurich");
		expect(segments.length).toBeGreaterThan(40);
		const statement = query.select({ day: dayIndex(visits.startedAt, segments) }).from(visits).toSQL();
		expect(statement.params).toEqual([]);
	});

	it("is a plain expression for a Range without a DST switch", () => {
		const statement = query.select({ day: dayIndex(visits.startedAt, daySegments("2026-05-01", "2026-05-07", "UTC")) }).from(visits).toSQL();
		expect(statement.sql).not.toContain("CASE");
	});
});

describe("planReport", () => {
	const plan = { rollupDates: ["2026-05-01"], rollupBounds: { from: "2026-05-01", to: "2026-05-01" }, raw: { startSec: 1_777_680_000, endSec: 1_777_690_000 } };

	it("keeps the Rollup plan without Filters", () => {
		expect(planReport(plan, [], "UTC")).toBe(plan);
	});

	it("reads the whole Range from raw rows with a Filter", () => {
		expect(planReport(plan, [{ dimension: "os", value: "iOS" }], "UTC")).toEqual({
			rollupDates: [],
			rollupBounds: null,
			raw: { startSec: Date.parse("2026-05-01T00:00:00Z") / 1000, endSec: 1_777_690_000 },
		});
	});
});
