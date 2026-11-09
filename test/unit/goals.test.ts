import { describe, expect, it } from "vitest";
import { describeGoal, goalFilter, goalGlob, parseGoalFilterValue, QUICK_GOALS } from "#layers/core/shared/utils/goals";
import { parseFilter } from "#layers/core/shared/utils/filters";
import { createGoalSchema } from "#layers/core/shared/schemas/goals";

describe("goal Filters", () => {
	it("writes a Goal's definition into the Filter value", () => {
		expect(goalFilter({ kind: "event", value: "Phone click" })).toEqual({ dimension: "goal", value: "event:Phone click" });
		expect(goalFilter({ kind: "page", value: "/blog/*" })).toEqual({ dimension: "goal", value: "page:/blog/*" });
		expect(goalFilter({ kind: "outbound", value: "" })).toEqual({ dimension: "goal", value: "outbound" });
	});

	it("reads the definition back", () => {
		expect(parseGoalFilterValue("event:a:b")).toEqual({ kind: "event", value: "a:b" });
		expect(parseGoalFilterValue("page:/pricing")).toEqual({ kind: "page", value: "/pricing" });
		expect(parseGoalFilterValue("outbound")).toEqual({ kind: "outbound", value: "" });
	});

	it.each([
		["an unknown kind", "click:Signup"],
		["an event without a name", "event:"],
		["a page pattern without a leading slash", "page:pricing"],
		["outbound with a value", "outbound:x"],
	])("rejects %s", (_, value) => {
		expect(parseGoalFilterValue(value)).toBeNull();
		expect(parseFilter(`goal:${value}`)).toBeNull();
	});

	it("is a Filter Dimension", () => {
		expect(parseFilter("goal:page:/blog/*")).toEqual({ dimension: "goal", value: "page:/blog/*" });
	});
});

describe("goalGlob", () => {
	it("keeps * as the only wildcard", () => {
		expect(goalGlob("/blog/*")).toBe("/blog/*");
		expect(goalGlob("/what?[x]")).toBe("/what[?][[]x]");
	});
});

describe("describeGoal", () => {
	it("names what a Goal counts", () => {
		expect(describeGoal({ kind: "event", value: "signup" })).toBe("signup");
		expect(describeGoal({ kind: "page", value: "/blog/*" })).toBe("Visited /blog/*");
		expect(describeGoal({ kind: "outbound", value: "" })).toBe("Outbound link clicks");
	});
});

describe("QUICK_GOALS", () => {
	it("uses the names the Tracking snippet sends", () => {
		expect(QUICK_GOALS.map(goal => goal.kind === "event" ? goal.value : goal.kind)).toEqual(["WhatsApp click", "Phone click", "Email click", "Form submit", "outbound"]);
	});
});

describe("createGoalSchema", () => {
	it("defaults the name to what the Goal counts", () => {
		expect(createGoalSchema.parse({ kind: "page", value: " /blog/* " })).toEqual({ kind: "page", value: "/blog/*", name: "Visited /blog/*" });
		expect(createGoalSchema.parse({ kind: "event", value: "signup", name: " Signups " })).toEqual({ kind: "event", value: "signup", name: "Signups" });
		expect(createGoalSchema.parse({ kind: "outbound" })).toEqual({ kind: "outbound", value: "", name: "Outbound link clicks" });
	});

	it.each([
		["a page pattern without a leading slash", { kind: "page", value: "blog" }],
		["an empty event name", { kind: "event", value: "  " }],
		["an unknown kind", { kind: "click", value: "x" }],
	])("rejects %s", (_, input) => {
		expect(createGoalSchema.safeParse(input).success).toBe(false);
	});
});
