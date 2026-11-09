import { describe, expect, it } from "vitest";
import type { FunnelHit, FunnelStep } from "#layers/core/shared/utils/funnels";
import { describeFunnelStep, funnelDepth, summarizeFunnel } from "#layers/core/shared/utils/funnels";
import { funnelSchema } from "#layers/core/shared/schemas/funnels";

const HOUR = 3600;
const steps: FunnelStep[] = [
	{ kind: "page", value: "/", label: "" },
	{ kind: "page", value: "/pricing*", label: "" },
	{ kind: "event", value: "signup", label: "Signed up" },
];

function page(timestamp: number, path: string, canEnter = true): FunnelHit {
	return { timestamp, kind: "page", value: path, canEnter };
}

function event(timestamp: number, name: string, canEnter = true): FunnelHit {
	return { timestamp, kind: "event", value: name, canEnter };
}

describe("funnelDepth", () => {
	it("counts every step completed in order", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/"), page(10, "/pricing"), event(20, "signup")])).toBe(3);
	});

	it("allows other pages and Events in between", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/"), page(5, "/blog"), event(6, "cta_click"), page(10, "/pricing/team"), page(15, "/about"), event(20, "signup")])).toBe(3);
	});

	it("stops at the first step done out of order", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/"), event(5, "signup"), page(10, "/pricing")])).toBe(2);
		expect(funnelDepth(steps, HOUR, [page(0, "/pricing"), page(10, "/"), event(20, "signup")])).toBe(1);
	});

	it("leaves out steps after the window", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/"), page(HOUR, "/pricing"), event(HOUR + 1, "signup")])).toBe(2);
	});

	it("tries a later entry when an earlier one runs out of time", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/"), page(2 * HOUR, "/"), page(2 * HOUR + 10, "/pricing"), event(2 * HOUR + 20, "signup")])).toBe(3);
	});

	it("enters only on a hit that may start the Funnel", () => {
		expect(funnelDepth(steps, HOUR, [page(0, "/", false), page(10, "/pricing", false)])).toBe(0);
		expect(funnelDepth(steps, HOUR, [page(0, "/"), page(10, "/pricing", false), event(20, "signup", false)])).toBe(3);
	});

	it("needs one hit per step, even when two steps match the same page", () => {
		const repeated: FunnelStep[] = [{ kind: "page", value: "/a", label: "" }, { kind: "page", value: "/a", label: "" }];
		expect(funnelDepth(repeated, HOUR, [page(0, "/a")])).toBe(1);
		expect(funnelDepth(repeated, HOUR, [page(0, "/a"), page(1, "/a")])).toBe(2);
	});

	it("sorts hits by time and puts a Pageview before an Event of the same second", () => {
		const pageThenEvent: FunnelStep[] = [{ kind: "page", value: "/pricing", label: "" }, { kind: "event", value: "signup", label: "" }];
		expect(funnelDepth(pageThenEvent, HOUR, [event(5, "signup"), page(5, "/pricing")])).toBe(2);
	});
});

describe("summarizeFunnel", () => {
	it("counts each step with its share of entries, continue rate and drop", () => {
		const report = summarizeFunnel(steps, [3, 2, 2, 1, 0], 10);
		expect(report).toMatchObject({ visitors: 10, entered: 4, completed: 1, conversionRate: 0.25, enteredRate: 0.4 });
		expect(report.steps.map(step => [step.label, step.visitors, step.entryRate, step.continueRate, step.dropped])).toEqual([
			["/", 4, 1, null, 0],
			["/pricing*", 3, 0.75, 0.75, 1],
			["Signed up", 1, 0.25, 1 / 3, 2],
		]);
	});

	it("answers zeros when nobody entered", () => {
		const report = summarizeFunnel(steps, [], 0);
		expect(report).toMatchObject({ visitors: 0, entered: 0, completed: 0, conversionRate: 0, enteredRate: 0 });
		expect(report.steps.map(step => [step.entryRate, step.continueRate])).toEqual([[0, null], [0, 0], [0, 0]]);
	});
});

describe("describeFunnelStep", () => {
	it("prefers the label, then names the page pattern or Event", () => {
		expect(describeFunnelStep({ kind: "page", value: "/signup/*", label: "" })).toBe("/signup/*");
		expect(describeFunnelStep({ kind: "event", value: "signup", label: "" })).toBe("signup");
		expect(describeFunnelStep({ kind: "event", value: "signup", label: "Signed up" })).toBe("Signed up");
	});
});

describe("funnelSchema", () => {
	it("trims and accepts 2 to 8 steps with a window", () => {
		const parsed = funnelSchema.parse({ name: " Checkout ", window: "7d", steps: [{ kind: "page", value: " /pricing " }, { kind: "event", value: "signup", label: " Done " }] });
		expect(parsed).toEqual({ name: "Checkout", window: "7d", steps: [{ kind: "page", value: "/pricing", label: "" }, { kind: "event", value: "signup", label: "Done" }] });
	});

	it("defaults the window to 24 hours", () => {
		expect(funnelSchema.parse({ name: "A", steps: [{ kind: "page", value: "/" }, { kind: "page", value: "/b" }] }).window).toBe("24h");
	});

	it("rejects too few or too many steps, bad steps, windows and names", () => {
		const step = { kind: "page", value: "/" };
		expect(funnelSchema.safeParse({ name: "A", steps: [step] }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: "A", steps: Array.from({ length: 9 }, () => step) }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: "A", steps: [step, { kind: "page", value: "pricing" }] }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: "A", steps: [step, { kind: "event", value: " " }] }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: "A", steps: [step, { kind: "outbound", value: "" }] }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: "A", window: "2h", steps: [step, step] }).success).toBe(false);
		expect(funnelSchema.safeParse({ name: " ", steps: [step, step] }).success).toBe(false);
	});
});
