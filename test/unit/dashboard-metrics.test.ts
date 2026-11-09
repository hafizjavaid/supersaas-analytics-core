import { describe, expect, it } from "vitest";
import { DASHBOARD_METRICS, metricChange, shownMetrics, toggleMetric, valueChange } from "#layers/core/app/utils/dashboard-metrics";
import type { DashboardSummary } from "#layers/core/shared/types/analytics";

const metric = (key: string) => DASHBOARD_METRICS.find(definition => definition.key === key)!;

function summary(overrides: Partial<DashboardSummary>): DashboardSummary {
	return { visitors: 0, visits: 0, pageviews: 0, bounceRate: 0, avgDurationSeconds: 0, conversionRate: null, revenue: null, ...overrides };
}

describe("metricChange", () => {
	it("shows a rise in Visitors as green", () => {
		expect(metricChange(metric("visitors"), summary({ visitors: 120 }), summary({ visitors: 100 }))).toEqual({ label: "+20%", tone: "success" });
	});

	it("shows a fall in Pageviews as red", () => {
		expect(metricChange(metric("pageviews"), summary({ pageviews: 50 }), summary({ pageviews: 100 }))).toEqual({ label: "-50%", tone: "error" });
	});

	it("shows a rise in bounce rate as red and a fall as green", () => {
		expect(metricChange(metric("bounceRate"), summary({ bounceRate: 0.6 }), summary({ bounceRate: 0.5 }))).toMatchObject({ tone: "error" });
		expect(metricChange(metric("bounceRate"), summary({ bounceRate: 0.4 }), summary({ bounceRate: 0.5 }))).toMatchObject({ tone: "success" });
	});

	it("shows no change as neutral", () => {
		expect(metricChange(metric("avgDurationSeconds"), summary({ avgDurationSeconds: 60 }), summary({ avgDurationSeconds: 60 }))).toEqual({ label: "0%", tone: "neutral" });
	});

	it("shows nothing when the previous period is empty", () => {
		expect(metricChange(metric("visitors"), summary({ visitors: 5 }), summary({}))).toBeNull();
	});
});

describe("Conversion rate", () => {
	it("is shown only once the Site has a Goal", () => {
		expect(shownMetrics(summary({})).map(definition => definition.key)).not.toContain("conversionRate");
		expect(shownMetrics(summary({ conversionRate: 0 })).map(definition => definition.key)).toContain("conversionRate");
	});

	it("shows a rise as green", () => {
		expect(metricChange(metric("conversionRate"), summary({ conversionRate: 0.03 }), summary({ conversionRate: 0.02 }))).toEqual({ label: "+50%", tone: "success" });
	});

	it("shows no change pill without Goals", () => {
		expect(metricChange(metric("conversionRate"), summary({}), summary({}))).toBeNull();
	});
});

describe("toggleMetric", () => {
	it("adds a series in the KPI strip's order", () => {
		expect(toggleMetric(["pageviews"], "visitors")).toEqual(["visitors", "pageviews"]);
	});

	it("removes a selected series", () => {
		expect(toggleMetric(["visitors", "bounceRate"], "visitors")).toEqual(["bounceRate"]);
	});

	it("keeps the last series on", () => {
		expect(toggleMetric(["bounceRate"], "bounceRate")).toEqual(["bounceRate"]);
	});
});

describe("valueChange", () => {
	it("treats a rise as good unless told otherwise", () => {
		expect(valueChange(3, 2)).toEqual({ label: "+50%", tone: "success" });
		expect(valueChange(3, 2, false)).toEqual({ label: "+50%", tone: "error" });
	});

	it("shows no change from an empty previous period", () => {
		expect(valueChange(3, 0)).toBeNull();
		expect(valueChange(0, 0)).toEqual({ label: "0%", tone: "neutral" });
	});
});

describe("Revenue", () => {
	it("is shown only once the Site has a Revenue connection", () => {
		expect(shownMetrics(summary({})).map(definition => definition.key)).not.toContain("revenue");
		expect(shownMetrics(summary({ revenue: 0 })).map(definition => definition.key)).toContain("revenue");
	});

	it("is formatted in the connection's currency", () => {
		expect(metric("revenue").format(4900, "eur")).toBe("€49");
	});

	it("shows a rise as green", () => {
		expect(metricChange(metric("revenue"), summary({ revenue: 200 }), summary({ revenue: 100 }))).toEqual({ label: "+100%", tone: "success" });
	});
});
