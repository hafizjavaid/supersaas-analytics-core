import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitForPageviews } from "./helpers";
import type { Summary, SummaryWithPrevious, TimeseriesPoint, TopListResult, TopPageRow } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const HOUR = 3600;

type SummaryResponse = SummaryWithPrevious & { range: ResolvedRange };

function summary(siteId: string, query: string) {
	return $fetch<SummaryResponse>(`/api/sites/${siteId}/summary?${query}`);
}

function timeseries(siteId: string, query: string) {
	return $fetch<{ range: ResolvedRange; points: TimeseriesPoint[] }>(`/api/sites/${siteId}/timeseries?${query}`);
}

async function seedDailySummary(siteId: string, date: string, row: Partial<Summary>) {
	const { visitors = 1, visits = 1, pageviews = 1, bounceRate = 0, avgDurationSeconds = 0 } = row;
	await testDb.execute({
		sql: "INSERT INTO daily_summary (site_id, date, visitors, visits, pageviews, bounce_rate, avg_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
		args: [siteId, date, visitors, visits, pageviews, bounceRate, avgDurationSeconds],
	});
}

// Only rows from the last few minutes move, so rows moved earlier stay where they are.
async function moveRecentRowsBack(siteId: string, seconds: number) {
	const recent = Math.floor(Date.now() / 1000) - 600;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ? AND started_at >= ?", args: [seconds, seconds, siteId, recent] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ? AND timestamp >= ?", args: [seconds, siteId, recent] },
	]);
}

async function pageviewFrom(siteId: string, path: string, query: string, expected: number) {
	await collect({ site_id: siteId, path }, { ip: uniqueIp() });
	await waitForPageviews(siteId, expected, query);
}

describe("previous-period comparison", () => {
	it("compares 7 days with the 7 days before from Rollups", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;
		await seedDailySummary(site.id, shiftDate(today, -1), { pageviews: 10, visitors: 5, visits: 6 });
		await seedDailySummary(site.id, shiftDate(today, -8), { pageviews: 4, visitors: 2, visits: 2 });
		await seedDailySummary(site.id, shiftDate(today, -13), { pageviews: 1, visitors: 1, visits: 1 });
		await seedDailySummary(site.id, shiftDate(today, -14), { pageviews: 99, visitors: 99, visits: 99 });

		const response = await summary(site.id, "range=7d");
		expect(response).toMatchObject({ pageviews: 10, visitors: 5, visits: 6 });
		expect(response.previous).toMatchObject({ pageviews: 5, visitors: 3, visits: 3 });
	});

	it("reads the counterpart of today from raw rows, not from its Rollup", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;
		await seedDailySummary(site.id, shiftDate(today, -7), { pageviews: 50 });

		expect((await summary(site.id, "range=7d")).previous.pageviews).toBe(0);
	});

	it("compares yesterday with the day before", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;
		await seedDailySummary(site.id, shiftDate(today, -1), { pageviews: 3, visits: 2, bounceRate: 0.5, avgDurationSeconds: 30 });
		await seedDailySummary(site.id, shiftDate(today, -2), { pageviews: 6, visits: 4, bounceRate: 0.25, avgDurationSeconds: 90 });

		const response = await summary(site.id, "range=yesterday");
		expect(response.range).toMatchObject({ fromDate: shiftDate(today, -1), toDate: shiftDate(today, -1) });
		expect(response).toMatchObject({ pageviews: 3, visits: 2, bounceRate: 0.5, avgDurationSeconds: 30 });
		expect(response.previous).toMatchObject({ pageviews: 6, visits: 4, bounceRate: 0.25, avgDurationSeconds: 90 });
	});

	it("compares today with yesterday only up to the same time of day", async () => {
		const site = await createSite({ timezone: timezoneAwayFromMidnight() });
		await pageviewFrom(site.id, "/earlier", "range=today", 1);
		await moveRecentRowsBack(site.id, 24 * HOUR);
		await pageviewFrom(site.id, "/later", "range=today", 1);
		await moveRecentRowsBack(site.id, 23 * HOUR);
		await pageviewFrom(site.id, "/now", "range=today", 1);

		const response = await summary(site.id, "range=today");
		expect(response.pageviews).toBe(1);
		expect(response.previous.pageviews).toBe(1);
	});

	it("answers an empty previous period with zeros", async () => {
		const site = await createSite();
		expect((await summary(site.id, "range=30d")).previous).toEqual({ visitors: 0, visits: 0, pageviews: 0, bounceRate: 0, avgDurationSeconds: 0, conversionRate: null, revenue: null });
	});
});

describe("last 24 hours", () => {
	it("reads raw rows only and compares with the 24 hours before", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;
		await seedDailySummary(site.id, shiftDate(today, -1), { pageviews: 50 });
		await pageviewFrom(site.id, "/day-and-a-half-ago", "range=today", 1);
		await moveRecentRowsBack(site.id, 36 * HOUR);
		await pageviewFrom(site.id, "/twenty-hours-ago", "range=today", 1);
		await moveRecentRowsBack(site.id, 20 * HOUR);
		await pageviewFrom(site.id, "/now", "range=24h", 2);

		const response = await summary(site.id, "range=24h");
		expect(response.range.hours).toBe(24);
		expect(response.pageviews).toBe(2);
		expect(response.previous.pageviews).toBe(1);

		const pages = await $fetch<TopListResult<TopPageRow>>(`/api/sites/${site.id}/pages?range=24h`);
		expect(pages.rows.map(row => row.path).sort()).toEqual(["/now", "/twenty-hours-ago"]);
	});

	it("charts the last 24 hours by the hour", async () => {
		const site = await createSite();
		await pageviewFrom(site.id, "/twenty-hours-ago", "range=today", 1);
		await moveRecentRowsBack(site.id, 20 * HOUR);
		await pageviewFrom(site.id, "/now", "range=24h", 2);

		const { points } = await timeseries(site.id, "range=24h");
		expect(points.length).toBeGreaterThanOrEqual(24);
		expect(points.length).toBeLessThanOrEqual(25);
		expect(points.every((point, index) => index === 0 || point.timestamp - points[index - 1]!.timestamp === HOUR * 1000)).toBe(true);
		expect(points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(2);
		expect(points.at(-1)!.pageviews).toBe(1);
	});
});

describe("Ranges", () => {
	it("charts yesterday by the hour from raw rows", async () => {
		const site = await createSite({ timezone: timezoneAwayFromMidnight() });
		await pageviewFrom(site.id, "/", "range=today", 1);
		await moveRecentRowsBack(site.id, 24 * HOUR);

		const { points } = await timeseries(site.id, "range=yesterday");
		expect(points).toHaveLength(24);
		expect(points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(1);
		expect(points.find(point => point.pageviews === 1)).toMatchObject({ visitors: 1, bounceRate: 1 });
	});

	it("resolves 90d and 12m, and no longer knows 1y", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;

		expect((await summary(site.id, "range=90d")).range.fromDate).toBe(shiftDate(today, -89));
		expect((await summary(site.id, "range=12m")).range.fromDate).toBe(shiftDate(today, -364));
		expect((await summary(site.id, "range=1y")).range.fromDate).toBe(shiftDate(today, -29));
	});

	it("charts bounce rate and visit duration per day", async () => {
		const site = await createSite();
		const { today } = (await getSummary(site.id)).range;
		await seedDailySummary(site.id, shiftDate(today, -2), { pageviews: 4, visits: 2, bounceRate: 0.5, avgDurationSeconds: 42 });

		const { points } = await timeseries(site.id, "range=7d");
		expect(points[4]).toMatchObject({ pageviews: 4, bounceRate: 0.5, avgDurationSeconds: 42 });
	});
});
