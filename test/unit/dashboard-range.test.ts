import { describe, expect, it } from "vitest";
import { rangeLabel, rangeReportQuery, readDashboardRange } from "#layers/core/app/utils/dashboard-range";

describe("readDashboardRange", () => {
	it("reads a known Range key", () => {
		expect(readDashboardRange({ range: "24h" })).toEqual({ key: "24h" });
	});

	it("falls back to 30 days for an unknown or old key", () => {
		expect(readDashboardRange({ range: "1y" })).toEqual({ key: "30d" });
		expect(readDashboardRange({})).toEqual({ key: "30d" });
	});

	it("reads a custom Range with both dates", () => {
		expect(readDashboardRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" })).toEqual({ key: "custom", from: "2026-01-01", to: "2026-01-31" });
	});

	it("falls back to 30 days for a custom Range missing a date", () => {
		expect(readDashboardRange({ range: "custom", from: "2026-01-01" })).toEqual({ key: "30d" });
		expect(readDashboardRange({ range: "custom", from: "2026-01-01", to: "soon" })).toEqual({ key: "30d" });
	});
});

describe("rangeReportQuery", () => {
	it("sends only the key for a preset Range", () => {
		expect(rangeReportQuery({ key: "7d" })).toEqual({ range: "7d" });
	});

	it("sends from and to for a custom Range", () => {
		expect(rangeReportQuery({ key: "custom", from: "2026-01-01", to: "2026-01-31" })).toEqual({ range: "custom", from: "2026-01-01", to: "2026-01-31" });
	});
});

describe("rangeLabel", () => {
	it("names a preset Range", () => {
		expect(rangeLabel({ key: "12m" })).toBe("Last 12 months");
	});

	it("shows the dates of a custom Range", () => {
		expect(rangeLabel({ key: "custom", from: "2026-01-01", to: "2026-01-31" })).toMatch(/Jan 1.*31, 2026/);
		expect(rangeLabel({ key: "custom", from: "2026-03-05", to: "2026-03-05" })).toBe("Mar 5, 2026");
	});
});
