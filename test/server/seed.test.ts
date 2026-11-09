import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, getSummary, testDb, uniqueIp, waitForPageviews } from "./helpers";
import type { Funnel, FunnelResults, GoalReport, PageStats, VisitorList, VisitorProfile } from "#layers/core/shared/types/analytics";
import type { Digest } from "#layers/core/shared/types/digests";
import type { ConversionsReport } from "#layers/core/shared/types/revenue";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

function seed(payload: Record<string, unknown>) {
	return $fetch<{ result: { siteId: string; rollupDays: number; todayVisits: number } }>("/_nitro/tasks/seed:demo", { method: "POST", body: { payload } });
}

describe("seed:demo", () => {
	it("fills past days with Rollups and today with raw rows, replacing what was there", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/real-page" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 1);

		const { result } = await seed({ siteId: site.id, days: 7 });
		expect(result).toMatchObject({ siteId: site.id, rollupDays: 6 });

		const summary = await getSummary(site.id, "range=30d");
		const rollupDays = await testDb.execute({ sql: "SELECT MIN(date) AS first, COUNT(*) AS count FROM daily_summary WHERE site_id = ?", args: [site.id] });
		expect(Number(rollupDays.rows[0]!.count)).toBe(6);
		expect(rollupDays.rows[0]!.first).toBe(shiftDate(summary.range.today, -6));
		expect((await getSummary(site.id)).visits).toBe(result.todayVisits);

		const pages = await $fetch<{ rows: { path: string }[] }>(`/api/sites/${site.id}/pages?range=today`);
		expect(pages.rows.map(row => row.path)).not.toContain("/real-page");
	});

	it("seeds yesterday as raw rows and rolls them up, so the hourly chart agrees with the Rollup", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 7 });

		const yesterday = await getSummary(site.id, "range=yesterday");
		const { points } = await $fetch<{ points: { pageviews: number }[] }>(`/api/sites/${site.id}/timeseries?range=yesterday`);
		expect(yesterday.pageviews).toBeGreaterThan(0);
		expect(points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(yesterday.pageviews);
		expect((await getSummary(site.id, "range=24h")).pageviews).toBeGreaterThan(0);
	});

	it("gives today's Visitors coordinates for the globe", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 2 });
		const missing = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM visitors WHERE site_id = ? AND last_latitude IS NULL", args: [site.id] });
		expect(Number(missing.rows[0]!.count)).toBe(0);
	});

	it("seeds every Channel, AI assistants and UTM terms", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 30 });
		const sources = (view: string) => $fetch<{ rows: { key: string }[] }>(`/api/sites/${site.id}/sources?range=30d&view=${view}`);

		expect((await sources("channel")).rows.map(row => row.key).sort()).toEqual(["ai", "direct", "email", "paid", "referral", "search", "social"]);
		expect((await sources("ai")).rows.map(row => row.key)).toContain("chatgpt.com");
		expect((await sources("term")).rows.length).toBeGreaterThan(0);
	});

	it("seeds Events with their pages and properties", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 30 });

		const { rows } = await $fetch<{ rows: { name: string; path: string | null }[] }>(`/api/sites/${site.id}/activity?range=30d`);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every(row => row.path?.startsWith("/"))).toBe(true);
		const names = ["signup", "pricing_click", "docs_search", "cta_click"];
		const breakdowns = await Promise.all(names.map(name => $fetch<{ properties: unknown[] }>(`/api/sites/${site.id}/event-properties?range=7d&name=${name}`)));
		expect(breakdowns.some(breakdown => breakdown.properties.length > 0)).toBe(true);
	});

	it("seeds page titles, Visits, bounces and time on page for the Pages tab", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 30 });

		const { rows, summary } = await $fetch<PageStats>(`/api/sites/${site.id}/page-stats?range=30d`);
		expect(summary.avgTimeOnPageSeconds).toBeGreaterThan(0);
		expect(rows.every(row => row.title && row.visits > 0 && row.trend.length === 30)).toBe(true);
		expect(rows.some(row => row.bounceRate !== null && row.avgTimeOnPageSeconds !== null)).toBe(true);
	});

	it("seeds Identified visitors whose journeys span several days", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 7 });

		const { rows } = await $fetch<VisitorList>(`/api/sites/${site.id}/visitors?range=7d`);
		const identified = rows.filter(row => row.identified);
		const daysByLabel = Map.groupBy(identified, row => row.label);
		const [label] = [...daysByLabel].find(([, days]) => days.length > 1)!;
		const profile = await $fetch<VisitorProfile>(`/api/sites/${site.id}/visitors/${daysByLabel.get(label)![0]!.id}`);
		expect(profile.journeys.length).toBeGreaterThan(1);
		expect(profile.journeys.every(journey => journey.steps.length > 0)).toBe(true);
		expect(rows.some(row => !row.identified)).toBe(true);
	});

	it("connects a demo Revenue provider and attributes Payments to Visitors, once however often it runs", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 7 });
		await seed({ siteId: site.id, days: 7 });

		const report = await $fetch<ConversionsReport>(`/api/sites/${site.id}/conversions?range=7d`);
		expect(report.currency).toBe("usd");
		expect(report.summary.payments).toBeGreaterThan(0);
		expect(report.rows.every(row => row.source && row.visits > 0)).toBe(true);
		const connections = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM revenue_connections WHERE site_id = ?", args: [site.id] });
		expect(Number(connections.rows[0]!.count)).toBe(1);
	});

	it("adds Goals that convert, once however often it runs", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 7 });
		await seed({ siteId: site.id, days: 7 });

		const report = await $fetch<GoalReport>(`/api/sites/${site.id}/goal-conversions?range=7d`);
		expect(report.goals.map(row => row.goal.name)).toEqual(expect.arrayContaining(["Signups", "Pricing page", "WhatsApp leads", "Outbound clicks"]));
		expect(report.goals).toHaveLength(8);
		expect(report.conversionRate).toBeGreaterThan(0);
		expect(report.goals.filter(row => row.conversions > 0).length).toBeGreaterThan(4);
	});

	it("adds Funnels that Visitors move through, once however often it runs", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 7 });
		await seed({ siteId: site.id, days: 7 });

		const funnels = await $fetch<Funnel[]>(`/api/sites/${site.id}/funnels`);
		expect(funnels.map(funnel => funnel.name)).toEqual(["Pricing to signup", "Docs onboarding"]);
		const report = await $fetch<FunnelResults>(`/api/sites/${site.id}/funnels/${funnels[0]!.id}/report?range=7d`);
		expect(report.entered).toBeGreaterThan(0);
		expect(report.steps[1]!.visitors).toBeGreaterThan(0);
	});

	it("writes the weekly Digests of the seeded weeks, once however often it runs", async () => {
		const site = await createSite();
		await seed({ siteId: site.id, days: 21 });
		await seed({ siteId: site.id, days: 21 });

		const digests = await $fetch<Digest[]>(`/api/sites/${site.id}/digests`);
		expect(digests.length).toBeGreaterThanOrEqual(2);
		expect(digests.every(digest => digest.frequency === "weekly" && digest.report.figures.visitors.current > 0)).toBe(true);
		expect(new Set(digests.map(digest => digest.fromDate)).size).toBe(digests.length);
	});

	it("fails for an unknown Site", async () => {
		const response = await fetch("/_nitro/tasks/seed:demo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ payload: { siteId: "unknown-site" } }),
		});
		expect(response.ok).toBe(false);
	});
});
