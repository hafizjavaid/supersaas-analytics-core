import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, getSummary, testDb, uniqueIp, waitForPageviews } from "./helpers";
import type { TimeseriesPoint } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { shiftDate, startOfDayUtcMs } from "#layers/core/shared/utils/dates";

await setupServer();

interface TimeseriesResponse {
	range: ResolvedRange;
	points: TimeseriesPoint[];
}

async function seedDailySummary(siteId: string, date: string, row: { visitors: number; visits: number; pageviews: number; bounceRate: number; avgDurationSeconds: number }) {
	await testDb.execute({
		sql: "INSERT INTO daily_summary (site_id, date, visitors, visits, pageviews, bounce_rate, avg_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
		args: [siteId, date, row.visitors, row.visits, row.pageviews, row.bounceRate, row.avgDurationSeconds],
	});
}

describe("summary", () => {
	it("weights bounce rate and duration by Visits across Rollup days", async () => {
		const site = await createSite();
		const { range } = await getSummary(site.id, "range=7d");
		await seedDailySummary(site.id, shiftDate(range.today, -1), { visitors: 3, visits: 4, pageviews: 10, bounceRate: 0.5, avgDurationSeconds: 60 });
		await seedDailySummary(site.id, shiftDate(range.today, -2), { visitors: 1, visits: 1, pageviews: 1, bounceRate: 1, avgDurationSeconds: 0 });

		const summary = await getSummary(site.id, "range=7d");
		expect(summary).toMatchObject({ visitors: 4, visits: 5, pageviews: 11 });
		expect(summary.bounceRate).toBeCloseTo(0.6);
		expect(summary.avgDurationSeconds).toBeCloseTo(48);
	});

	it("ignores Rollup rows outside the Range", async () => {
		const site = await createSite();
		const { range } = await getSummary(site.id, "range=7d");
		await seedDailySummary(site.id, shiftDate(range.today, -7), { visitors: 9, visits: 9, pageviews: 9, bounceRate: 1, avgDurationSeconds: 0 });

		expect((await getSummary(site.id, "range=7d")).pageviews).toBe(0);
		expect((await getSummary(site.id, "range=30d")).pageviews).toBe(9);
	});

	it("never reads a Rollup row for today, only raw rows", async () => {
		const site = await createSite();
		const { range } = await getSummary(site.id, "range=today");
		await seedDailySummary(site.id, range.today, { visitors: 50, visits: 50, pageviews: 50, bounceRate: 1, avgDurationSeconds: 0 });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });

		expect((await waitForPageviews(site.id, 1, "range=30d")).pageviews).toBe(1);
	});

	it("resolves a custom Range from from and to", async () => {
		const site = await createSite();
		await seedDailySummary(site.id, "2026-01-10", { visitors: 2, visits: 2, pageviews: 7, bounceRate: 0, avgDurationSeconds: 30 });

		const summary = await getSummary(site.id, "range=custom&from=2026-01-01&to=2026-01-31");
		expect(summary.range).toMatchObject({ fromDate: "2026-01-01", toDate: "2026-01-31" });
		expect(summary.pageviews).toBe(7);
	});
});

describe("timeseries", () => {
	it("charts one zero-filled point per day at the Site's local midnight", async () => {
		const site = await createSite({ timezone: "America/New_York" });
		const { range } = await getSummary(site.id, "range=7d");
		await seedDailySummary(site.id, shiftDate(range.today, -3), { visitors: 2, visits: 3, pageviews: 5, bounceRate: 0, avgDurationSeconds: 0 });

		const { points } = await $fetch<TimeseriesResponse>(`/api/sites/${site.id}/timeseries?range=7d`);
		expect(points).toHaveLength(7);
		expect(points.map(point => point.timestamp)).toEqual(
			Array.from({ length: 7 }, (_, index) => startOfDayUtcMs(shiftDate(range.fromDate, index), "America/New_York")),
		);
		expect(points[3]).toMatchObject({ pageviews: 5, visitors: 2 });
		expect(points.filter(point => point.pageviews === 0)).toHaveLength(6);
	});

	it("charts today hourly up to the current hour", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 1);

		const { range, points } = await $fetch<TimeseriesResponse>(`/api/sites/${site.id}/timeseries?range=today`);
		const dayStart = startOfDayUtcMs(range.today, "UTC");
		const currentHour = Math.floor((Date.now() - dayStart) / 3_600_000);
		expect(points).toHaveLength(currentHour + 1);
		expect(points.at(-1)!.timestamp).toBe(dayStart + currentHour * 3_600_000);
		expect(points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(1);
	});
});
