import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitForPageviews } from "./helpers";
import type { PageStats, PageStatsRow, Site } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function pageStats(siteId: string, query = "range=today") {
	return $fetch<PageStats>(`/api/sites/${siteId}/page-stats?${query}`);
}

function rowFor(stats: PageStats, path: string) {
	return stats.rows.find(row => row.path === path);
}

function sum(values: number[]) {
	return values.reduce((total, value) => total + value, 0);
}

// Hits arrive within the same second, so each Visit's Pageviews are spaced out by moving them back: offsets are seconds before its last Pageview.
async function spaceOutVisit(siteId: string, entryPage: string, offsets: number[]) {
	const visit = await testDb.execute({ sql: "SELECT id FROM visits WHERE site_id = ? AND entry_page = ? AND page_count = ?", args: [siteId, entryPage, offsets.length] });
	const visitId = String(visit.rows[0]!.id);
	const pageRows = await testDb.execute({ sql: "SELECT id, timestamp FROM pages WHERE visit_id = ? ORDER BY id", args: [visitId] });
	const last = Number(pageRows.rows.at(-1)!.timestamp);
	await testDb.batch(pageRows.rows.map((row, index) => ({
		sql: "UPDATE pages SET timestamp = ? WHERE id = ?",
		args: [last - offsets[index]!, row.id],
	})));
	await testDb.execute({ sql: "UPDATE visits SET started_at = ? WHERE id = ?", args: [last - offsets[0]!, visitId] });
}

async function visitInOrder(siteId: string, visitor: { ip: string; userAgent?: string }, hits: { path: string; title?: string }[], pageviewsBefore: number) {
	for (const [index, hit] of hits.entries()) {
		await collect({ site_id: siteId, ...hit }, visitor);
		await waitForPageviews(siteId, pageviewsBefore + index + 1);
	}
}

let site: Site;

// alice: / (Home) 30 s, /pricing 60 s, /docs        bob: / (bounce)        carol (Safari): /pricing 40 s, /
beforeAll(async () => {
	site = await createSite({ domain: "pages.example.com", timezone: timezoneAwayFromMidnight() });
	await visitInOrder(site.id, { ip: uniqueIp() }, [{ path: "/", title: "Home" }, { path: "/pricing", title: "Pricing" }, { path: "/docs" }], 0);
	await visitInOrder(site.id, { ip: uniqueIp() }, [{ path: "/", title: "Home" }], 3);
	await visitInOrder(site.id, { ip: uniqueIp(), userAgent: SAFARI_IPHONE }, [{ path: "/pricing", title: "Pricing" }, { path: "/", title: "Home" }], 4);
	await spaceOutVisit(site.id, "/", [90, 60, 0]);
	await spaceOutVisit(site.id, "/pricing", [40, 0]);
});

describe("page stats", () => {
	it("summarises pages, Pageviews, Visits, bounce and time on page", async () => {
		const { summary } = await pageStats(site.id);
		expect(summary).toMatchObject({ pages: 3, pageviews: 6, visits: 3 });
		expect(summary.bounceRate).toBeCloseTo(1 / 3);
		expect(summary.avgTimeOnPageSeconds).toBeCloseTo((30 + 60 + 40) / 3);
	});

	it("reports each page's views, Visits, bounce rate and time on page, ranked by views", async () => {
		const stats = await pageStats(site.id);
		expect(stats.total).toBe(3);
		expect(stats.rows.map(row => row.path)).toEqual(["/", "/pricing", "/docs"]);
		expect(rowFor(stats, "/")).toMatchObject({ title: "Home", pageviews: 3, visits: 3, bounceRate: 0.5, avgTimeOnPageSeconds: 30 });
		expect(rowFor(stats, "/pricing")).toMatchObject({ title: "Pricing", pageviews: 2, visits: 2, bounceRate: 0, avgTimeOnPageSeconds: 50 });
		expect(rowFor(stats, "/docs")).toMatchObject({ title: null, pageviews: 1, visits: 1, bounceRate: null, avgTimeOnPageSeconds: null });
	});

	it("gives each page an hourly trend of its views for a single day", async () => {
		const stats = await pageStats(site.id);
		const home = rowFor(stats, "/")!;
		expect(home.trend.length).toBeGreaterThan(0);
		expect(home.trend.length).toBeLessThanOrEqual(25);
		expect(sum(home.trend)).toBe(3);
		expect(stats.rows.every(row => row.trend.length === home.trend.length)).toBe(true);
	});

	it("sorts by any column, with pages lacking a value last", async () => {
		const paths = async (query: string) => (await pageStats(site.id, `range=today&${query}`)).rows.map(row => row.path);
		expect(await paths("sort=page&order=asc")).toEqual(["/", "/docs", "/pricing"]);
		expect(await paths("sort=duration&order=asc")).toEqual(["/", "/pricing", "/docs"]);
		expect(await paths("sort=duration&order=desc")).toEqual(["/pricing", "/", "/docs"]);
		expect(await paths("sort=bounce&order=desc")).toEqual(["/", "/pricing", "/docs"]);
		expect(await paths("sort=visits&order=asc")).toEqual(["/docs", "/pricing", "/"]);
		expect(await paths("sort=unknown")).toEqual(["/", "/pricing", "/docs"]);
	});

	it("searches paths and titles without changing the summary", async () => {
		const byPath = await pageStats(site.id, "range=today&q=DOC");
		expect(byPath.rows.map(row => row.path)).toEqual(["/docs"]);
		expect(byPath.total).toBe(1);
		expect(byPath.summary.pages).toBe(3);

		const byTitle = await pageStats(site.id, "range=today&q=home");
		expect(byTitle.rows.map(row => row.path)).toEqual(["/"]);
	});

	it("applies Filters to the summary and the rows", async () => {
		const stats = await pageStats(site.id, `range=today&f=${encodeURIComponent("browser:Safari")}`);
		expect(stats.summary).toMatchObject({ pages: 2, pageviews: 2, visits: 1, bounceRate: 0 });
		expect(stats.rows.map(row => [row.path, row.pageviews])).toEqual([["/", 1], ["/pricing", 1]]);
		expect(rowFor(stats, "/pricing")).toMatchObject({ avgTimeOnPageSeconds: 40, bounceRate: 0 });
	});

	it("answers an empty Site with nothing", async () => {
		const empty = await createSite();
		expect(await pageStats(empty.id)).toMatchObject({
			summary: { pages: 0, pageviews: 0, visits: 0, bounceRate: 0, avgTimeOnPageSeconds: 0 },
			rows: [],
			total: 0,
		});
	});
});

let pastSite: Promise<{ site: Site; today: string }> | undefined;

// Yesterday: one Visit to / (Home) for 30 s, then /pricing. Today: one bounce on /.
function arrangePastSite() {
	pastSite ??= (async () => {
		const site = await createSite({ timezone: timezoneAwayFromMidnight() });
		await visitInOrder(site.id, { ip: uniqueIp() }, [{ path: "/", title: "Home" }, { path: "/pricing", title: "Pricing" }], 0);
		await spaceOutVisit(site.id, "/", [30, 0]);
		await testDb.batch([
			{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [DAY, DAY, site.id] },
			{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, site.id] },
		]);
		await visitInOrder(site.id, { ip: uniqueIp() }, [{ path: "/", title: "Home page" }], 0);
		return { site, today: (await getSummary(site.id)).range.today };
	})();
	return pastSite;
}

describe("past days", () => {
	it("compares each page's Visits with the previous period", async () => {
		const { site: pastSite } = await arrangePastSite();
		const stats = await pageStats(pastSite.id);
		expect(rowFor(stats, "/")).toMatchObject({ visits: 1, previousVisits: 1 });
	});

	it("reads past days from the Rollup and today from raw rows", async () => {
		const { site: pastSite, today } = await arrangePastSite();
		await $fetch("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload: { date: shiftDate(today, -1) } } });
		await testDb.execute({ sql: "DELETE FROM pages WHERE site_id = ? AND path = '/pricing'", args: [pastSite.id] });

		const stats = await pageStats(pastSite.id, "range=7d");
		expect(stats.summary).toMatchObject({ pages: 2, pageviews: 3, visits: 2 });
		const home = rowFor(stats, "/") as PageStatsRow;
		expect(home).toMatchObject({ title: "Home page", pageviews: 2, visits: 2, bounceRate: 0.5, avgTimeOnPageSeconds: 30 });
		expect(home.trend).toEqual([0, 0, 0, 0, 0, 1, 1]);
		expect(rowFor(stats, "/pricing")).toMatchObject({ title: "Pricing", pageviews: 1, visits: 1, bounceRate: null, avgTimeOnPageSeconds: null, trend: [0, 0, 0, 0, 0, 1, 0] });
	});

	it("reads a filtered past Range from raw rows by day", async () => {
		const { site: pastSite } = await arrangePastSite();
		const stats = await pageStats(pastSite.id, `range=7d&f=${encodeURIComponent("page:/")}`);
		expect(rowFor(stats, "/")).toMatchObject({ pageviews: 2, trend: [0, 0, 0, 0, 0, 1, 1] });
	});
});
