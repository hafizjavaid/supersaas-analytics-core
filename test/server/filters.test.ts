import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Site, SummaryWithPrevious, TimeseriesPoint, TopEventRow, TopListResult } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;
const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function visitor(userAgent: string, country: string, region: string, city: string) {
	return { ip: uniqueIp(), userAgent, headers: { "x-vercel-ip-country": country, "x-vercel-ip-country-region": region, "x-vercel-ip-city": city } };
}

function withFilters(query: string, filters: string[]) {
	return [query, ...filters.map(filter => `f=${encodeURIComponent(filter)}`)].join("&");
}

function summary(siteId: string, filters: string[], query = "range=today") {
	return $fetch<SummaryWithPrevious>(`/api/sites/${siteId}/summary?${withFilters(query, filters)}`);
}

function list<TRow>(siteId: string, resource: string, view: string, filters: string[], query = "range=today") {
	return $fetch<TopListResult<TRow>>(`/api/sites/${siteId}/${resource}?${withFilters(`${query}&view=${view}`, filters)}`);
}

function timeseries(siteId: string, filters: string[], query: string) {
	return $fetch<{ points: TimeseriesPoint[] }>(`/api/sites/${siteId}/timeseries?${withFilters(query, filters)}`);
}

// Moves a Site's raw rows back by whole days, keeping the time of day.
async function moveRawRowsBack(siteId: string, days: number) {
	const seconds = days * DAY;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [seconds, seconds, siteId] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
		{ sql: "UPDATE events SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
	]);
}

let site: Site;
let pastSite: Site;
let today: string;

// A Safari visit 8 days ago; Safari, Safari and Chrome yesterday (rolled up); Safari today.
async function arrangePastDays() {
	pastSite = await createSite({ timezone: timezoneAwayFromMidnight() });
	today = (await getSummary(pastSite.id)).range.today;

	await collect({ site_id: pastSite.id, path: "/old" }, visitor(SAFARI_IPHONE, "PK", "PB", "Lahore"));
	await waitForPageviews(pastSite.id, 1);
	await moveRawRowsBack(pastSite.id, 7);

	await collect({ site_id: pastSite.id, path: "/a" }, visitor(SAFARI_IPHONE, "PK", "PB", "Lahore"));
	await collect({ site_id: pastSite.id, path: "/b" }, visitor(SAFARI_IPHONE, "US", "CA", "Fresno"));
	await collect({ site_id: pastSite.id, path: "/c" }, visitor(CHROME_WINDOWS, "PK", "SD", "Karachi"));
	await waitForPageviews(pastSite.id, 3);
	await moveRawRowsBack(pastSite.id, 1);
	await $fetch("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload: { date: shiftDate(today, -1) } } });

	await collect({ site_id: pastSite.id, path: "/d" }, visitor(SAFARI_IPHONE, "PK", "PB", "Lahore"));
	await waitForPageviews(pastSite.id, 1);
}

// alice: Chrome, Bern (CH), google.com with UTM, / then /pricing, signup, one Outbound link
// bob:   Safari, San Francisco (US), direct, /, download
// dave:  Safari, Zurich (CH), news.ycombinator.com, /blog
// erin:  Chrome, New York (US), direct, /blog then /pricing
beforeAll(async () => {
	site = await createSite({ domain: "filters.example.com", timezone: timezoneAwayFromMidnight() });
	const alice = visitor(CHROME_WINDOWS, "CH", "BE", "Bern");
	const bob = visitor(SAFARI_IPHONE, "US", "CA", "San%20Francisco");
	const dave = visitor(SAFARI_IPHONE, "CH", "ZH", "Zurich");
	const erin = visitor(CHROME_WINDOWS, "US", "NY", "New%20York");

	await collect({ site_id: site.id, path: "/", referrer: "www.google.com", utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch" }, alice);
	await collect({ site_id: site.id, path: "/", referrer: null }, bob);
	await collect({ site_id: site.id, path: "/blog", referrer: "news.ycombinator.com" }, dave);
	await collect({ site_id: site.id, path: "/blog", referrer: null }, erin);
	await waitForPageviews(site.id, 4);

	await collect({ site_id: site.id, path: "/pricing" }, alice);
	await collect({ site_id: site.id, path: "/pricing" }, erin);
	await collect({ site_id: site.id, name: "signup" }, alice);
	await collect({ site_id: site.id, name: "download" }, bob);
	await collect({ site_id: site.id, outbound_url: "https://github.com/owner/repo" }, alice);
	await waitForPageviews(site.id, 6);
	await waitFor(() => $fetch<{ rows: TopEventRow[] }>(`/api/sites/${site.id}/activity?range=today`), response => response.rows.length === 2);
	await waitFor(() => list(site.id, "pages", "outbound", []), response => response.total === 1);
	await arrangePastDays();
});

describe("filtered summary", () => {
	it.each([
		[["browser:Safari"], { visitors: 2, visits: 2, pageviews: 2, bounceRate: 1 }],
		[["country:US"], { visitors: 2, visits: 2, pageviews: 3, bounceRate: 0.5 }],
		[["page:/pricing"], { visitors: 2, visits: 2, pageviews: 4, bounceRate: 0 }],
		[["entry_page:/blog"], { visitors: 2, pageviews: 3 }],
		[["exit_page:/pricing"], { visitors: 2, pageviews: 4 }],
		[["referrer:(direct)"], { visitors: 2, pageviews: 3 }],
		[["utm_source:newsletter"], { visitors: 1, pageviews: 2 }],
		[["utm_medium:email"], { visitors: 1, pageviews: 2 }],
		[["utm_campaign:launch"], { visitors: 1, pageviews: 2 }],
		[["channel:direct"], { visitors: 2, pageviews: 3 }],
		[["channel:social"], { visitors: 1, pageviews: 1 }],
		[["channel:email"], { visitors: 1, pageviews: 2 }],
		[["region:US-CA"], { visitors: 1, pageviews: 1 }],
		[["city:CH-Bern"], { visitors: 1, pageviews: 2 }],
		[["os:iOS"], { visitors: 2, pageviews: 2 }],
		[["device:desktop"], { visitors: 2, pageviews: 4 }],
		[["event:signup"], { visitors: 1, pageviews: 2 }],
	])("counts only the Visits matching %j", async (filters, expected) => {
		expect(await summary(site.id, filters)).toMatchObject(expected);
	});

	it("combines two Filters with AND", async () => {
		expect(await summary(site.id, ["country:US"])).toMatchObject({ visitors: 2 });
		expect(await summary(site.id, ["browser:Safari"])).toMatchObject({ visitors: 2 });
		expect(await summary(site.id, ["country:US", "browser:Safari"])).toMatchObject({ visitors: 1, visits: 1, pageviews: 1 });
		expect(await summary(site.id, ["country:US", "event:signup"])).toMatchObject({ visitors: 0, pageviews: 0 });
	});

	it("matches a region within its country only", async () => {
		expect(await summary(site.id, ["region:CH-CA"])).toMatchObject({ visitors: 0 });
	});

	it("ignores invalid Filters", async () => {
		expect(await summary(site.id, ["colour:red", "region:CA"])).toMatchObject({ visitors: 4, pageviews: 6 });
	});

	it("matches a hand count over the raw rows", async () => {
		const raw = await testDb.execute({
			sql: `SELECT COUNT(DISTINCT v.visitor_id) AS visitors, COUNT(*) AS visits
				FROM visits v JOIN devices d ON d.id = v.device_id JOIN locations l ON l.id = v.location_id
				WHERE v.site_id = ? AND d.browser = 'Chrome' AND l.country = 'CH'`,
			args: [site.id],
		});
		expect(await summary(site.id, ["browser:Chrome", "country:CH"])).toMatchObject({ visitors: Number(raw.rows[0]!.visitors), visits: Number(raw.rows[0]!.visits) });
		expect(Number(raw.rows[0]!.visitors)).toBe(1);
	});
});

describe("filtered ranked lists", () => {
	it("ranks pages within the matching Visits", async () => {
		const response = await list<{ path: string; count: number }>(site.id, "pages", "top", ["page:/pricing"]);
		expect(response.rows[0]).toEqual({ path: "/pricing", count: 2 });
		expect(response.rows).toHaveLength(3);
		expect(response.total).toBe(4);
	});

	it("ranks Entry pages and Exit pages of the matching Visits", async () => {
		expect((await list(site.id, "pages", "entered", ["country:US"])).rows).toHaveLength(2);
		expect((await list<{ path: string; count: number }>(site.id, "pages", "exited", ["country:US"])).rows).toEqual(expect.arrayContaining([
			{ path: "/", count: 1 },
			{ path: "/pricing", count: 1 },
		]));
	});

	it("ranks referrers and UTM campaigns of the matching Visits", async () => {
		const referrers = await list<{ key: string; visits: number }>(site.id, "sources", "referrer", ["browser:Safari"]);
		expect(referrers.rows.map(row => row.key).sort()).toEqual(["(direct)", "news.ycombinator.com"]);
		expect((await list(site.id, "sources", "campaign", ["browser:Safari"])).rows).toEqual([]);
		expect((await list(site.id, "sources", "campaign", ["browser:Chrome"])).total).toBe(1);
	});

	it("ranks Outbound links of the matching Visitors", async () => {
		expect((await list(site.id, "pages", "outbound", ["country:CH"])).total).toBe(1);
		expect((await list(site.id, "pages", "outbound", ["country:US"])).total).toBe(0);
	});

	it("ranks devices and locations of the matching Visits", async () => {
		expect((await list<{ value: string; visits: number }>(site.id, "devices", "browser", ["country:CH"])).rows.map(row => row.value).sort()).toEqual(["Chrome", "Safari"]);
		const countries = await list<{ country: string; visits: number }>(site.id, "locations", "country", ["browser:Safari"]);
		expect(countries.rows.map(row => row.country).sort()).toEqual(["CH", "US"]);
		const cities = await list<{ city: string }>(site.id, "locations", "city", ["country:US", "browser:Chrome"]);
		expect(cities.rows.map(row => row.city)).toEqual(["New York"]);
	});

	it("ranks Events of the matching Visits", async () => {
		const response = await $fetch<{ rows: TopEventRow[] }>(`/api/sites/${site.id}/activity?${withFilters("range=today", ["browser:Safari"])}`);
		expect(response.rows).toEqual([{ name: "download", path: null, count: 1 }]);
	});

	it("charts only the matching Visits by the hour", async () => {
		const { points } = await timeseries(site.id, ["browser:Safari"], "range=today");
		expect(points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(2);
	});
});

describe("filtered Ranges over past days", () => {
	it("reads yesterday from raw rows, not from its Rollup", async () => {
		await testDb.execute({ sql: "UPDATE daily_summary SET visitors = 99, pageviews = 99 WHERE site_id = ?", args: [pastSite.id] });
		expect(await summary(pastSite.id, [], "range=7d")).toMatchObject({ pageviews: 100 });
		expect(await summary(pastSite.id, ["country:PK"], "range=7d")).toMatchObject({ visitors: 3, pageviews: 3 });
		expect(await summary(pastSite.id, ["country:PK", "browser:Safari"], "range=7d")).toMatchObject({ visitors: 2, pageviews: 2 });
	});

	it("compares with the previous period from raw rows", async () => {
		const response = await summary(pastSite.id, ["browser:Safari"], "range=7d");
		expect(response.previous).toMatchObject({ visitors: 1, pageviews: 1 });
		expect((await summary(pastSite.id, ["browser:Chrome"], "range=7d")).previous).toMatchObject({ visitors: 0 });
	});

	it("charts each day from raw rows", async () => {
		const { points } = await timeseries(pastSite.id, ["browser:Safari"], "range=7d");
		expect(points).toHaveLength(7);
		expect(points.map(point => point.pageviews)).toEqual([0, 0, 0, 0, 0, 2, 1]);
		expect(points[5]).toMatchObject({ visitors: 2, bounceRate: 1 });
	});

	it("ranks a past day from raw rows", async () => {
		const response = await list<{ path: string; count: number }>(pastSite.id, "pages", "top", ["city:PK-Lahore"], "range=yesterday");
		expect(response.rows).toEqual([{ path: "/a", count: 1 }]);
	});

	it("reads a custom Range reaching back past the previous week", async () => {
		const query = `range=custom&from=${shiftDate(today, -10)}&to=${today}`;
		expect(await summary(pastSite.id, ["browser:Safari"], query)).toMatchObject({ visitors: 4, pageviews: 4 });
	});
});
