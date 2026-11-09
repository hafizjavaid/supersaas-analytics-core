import { describe, expect, it } from "vitest";
import { toolPartView } from "#layers/core/app/utils/ai";

const range = { fromDate: "2026-10-01", toDate: "2026-10-07", today: "2026-10-10" };

describe("toolPartView", () => {
	it("charts a timeseries result, by the hour for a single day", () => {
		const points = [{ timestamp: 0, visitors: 1, pageviews: 2 }];
		expect(toolPartView({ type: "tool-timeseries", state: "output-available", output: { site: "Blog", range, points } })).toEqual({ kind: "timeseries", label: "Traffic on Blog", points, hourly: false });
		const day = { ...range, fromDate: "2026-10-10", toDate: "2026-10-10" };
		expect(toolPartView({ type: "tool-timeseries", state: "output-available", output: { site: "Blog", range: day, points } })).toMatchObject({ hourly: true });
	});

	it("ranks a topList result", () => {
		const output = { site: "Blog", range, dimension: "country", metric: "visits", rows: [{ label: "US", value: 4 }], total: 4 };
		expect(toolPartView({ type: "tool-topList", state: "output-available", output })).toEqual({ kind: "topList", label: "Top countries on Blog", metric: "visits", rows: [{ key: "US", label: "US", value: 4 }], total: 4 });
	});

	it("shows a refusal as an error and other results as done", () => {
		expect(toolPartView({ type: "tool-summary", state: "output-available", output: { error: "Site not found: x" } })).toEqual({ kind: "error", label: "Site not found: x" });
		expect(toolPartView({ type: "tool-summary", state: "output-available", output: { site: "Blog" } })).toEqual({ kind: "done", label: "Read the summary" });
		expect(toolPartView({ type: "tool-goals", state: "output-error", errorText: "boom" })).toEqual({ kind: "error", label: "Could not read Goals" });
	});

	it("shows a call still running as pending", () => {
		expect(toolPartView({ type: "tool-listSites", state: "input-available" })).toEqual({ kind: "pending", label: "Listing sites…" });
	});
});
