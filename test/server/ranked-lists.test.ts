import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Site } from "#layers/core/shared/types/analytics";

await setupServer();

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

interface ListResponse<TRow> {
	range: { today: string };
	rows: TRow[];
	total: number;
}

let site: Site;

function list<TRow>(resource: string, view?: string) {
	return $fetch<ListResponse<TRow>>(`/api/sites/${site.id}/${resource}?range=today${view ? `&view=${view}` : ""}`);
}

beforeAll(async () => {
	site = await createSite({ domain: "ranked.example.com" });
	const alice = { ip: uniqueIp(), userAgent: CHROME_WINDOWS, headers: { "x-vercel-ip-country": "CH", "x-vercel-ip-country-region": "BE", "x-vercel-ip-city": "Bern" } };
	const bob = { ip: uniqueIp(), userAgent: SAFARI_IPHONE, headers: { "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco" } };
	const carol = { ip: uniqueIp(), userAgent: FIREFOX_LINUX };

	await collect({ site_id: site.id, path: "/", referrer: "www.google.com", utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch" }, alice);
	await collect({ site_id: site.id, path: "/", referrer: null }, bob);
	await collect({ site_id: site.id, path: "/blog", referrer: "news.ycombinator.com" }, carol);
	await waitForPageviews(site.id, 3);

	await collect({ site_id: site.id, path: "/pricing", referrer: "ranked.example.com" }, alice);
	await collect({ site_id: site.id, outbound_url: "https://github.com/owner/repo?tab=readme" }, alice);
	await collect({ site_id: site.id, outbound_url: "https://github.com/owner/repo#install" }, alice);
	await collect({ site_id: site.id, outbound_url: "https://docs.example.org/guide" }, bob);
	await collect({ site_id: site.id, outbound_url: "https://ranked.example.com/about" }, bob);
	await collect({ site_id: site.id, name: "signup", props: { plan: "pro" } }, alice);
	await collect({ site_id: site.id, name: "signup" }, alice);
	await collect({ site_id: site.id, name: "download" }, bob);
	await waitForPageviews(site.id, 4);
	await waitFor(() => list("activity"), response => response.rows.length === 2);
	await waitFor(() => list("pages", "outbound"), response => response.total === 3);
});

describe("pages", () => {
	it("ranks top pages by Pageviews", async () => {
		const response = await list<{ path: string; count: number }>("pages", "top");
		expect(response.rows[0]).toEqual({ path: "/", count: 2 });
		expect(response.rows).toContainEqual({ path: "/blog", count: 1 });
		expect(response.rows).toContainEqual({ path: "/pricing", count: 1 });
		expect(response.total).toBe(4);
		expect(response.range.today).toBeTruthy();
	});

	it("ranks Entry pages", async () => {
		const response = await list<{ path: string; count: number }>("pages", "entered");
		expect(response.rows[0]).toEqual({ path: "/", count: 2 });
		expect(response.rows).toContainEqual({ path: "/blog", count: 1 });
		expect(response.total).toBe(3);
	});

	it("ranks Exit pages", async () => {
		const response = await list<{ path: string; count: number }>("pages", "exited");
		expect(response.rows).toHaveLength(3);
		expect(response.rows).toContainEqual({ path: "/pricing", count: 1 });
		expect(response.rows).toContainEqual({ path: "/", count: 1 });
	});

	it("ranks Outbound links without query string or hash, ignoring same-domain links", async () => {
		const response = await list("pages", "outbound");
		expect(response.rows).toEqual([
			{ path: "https://github.com/owner/repo", count: 2 },
			{ path: "https://docs.example.org/guide", count: 1 },
		]);
		expect(response.total).toBe(3);
	});

	it("falls back to top pages for an unknown view", async () => {
		expect(await list("pages", "nonsense")).toEqual(await list("pages", "top"));
	});
});

describe("sources", () => {
	it("ranks referrers by Visits, with direct traffic labelled Direct", async () => {
		const response = await list("sources", "referrer");
		expect(response.rows).toHaveLength(3);
		expect(response.rows).toContainEqual({ key: "google.com", label: "google.com", referrerDomain: "google.com", visits: 1 });
		expect(response.rows).toContainEqual({ key: "(direct)", label: "Direct", referrerDomain: "(direct)", visits: 1 });
		expect(response.total).toBe(3);
	});

	it("ranks Channels", async () => {
		const response = await list("sources", "channel");
		expect(response.rows).toHaveLength(3);
		expect(response.rows).toEqual(expect.arrayContaining([
			{ key: "email", label: "Email", visits: 1 },
			{ key: "direct", label: "Direct", visits: 1 },
			{ key: "social", label: "Social", visits: 1 },
		]));
	});

	it.each([
		["campaign", "launch"],
		["medium", "email"],
	])("ranks UTM %s values", async (view, value) => {
		const response = await list("sources", view);
		expect(response.rows).toEqual([{ key: value, label: value, visits: 1 }]);
		expect(response.total).toBe(1);
	});

	it("falls back to Channels for an unknown view", async () => {
		expect(await list("sources", "nonsense")).toEqual(await list("sources", "channel"));
	});
});

describe("devices", () => {
	it.each([
		["browser", ["Chrome", "Firefox", "Safari"]],
		["os", ["Linux", "Windows", "iOS"]],
	])("ranks by %s", async (view, values) => {
		const response = await list<{ value: string; visits: number }>("devices", view);
		expect(response.rows.map(row => row.value).sort()).toEqual(values);
		expect(response.total).toBe(3);
	});

	it("ranks by device type", async () => {
		const response = await list("devices", "device");
		expect(response.rows).toEqual([{ value: "desktop", visits: 2 }, { value: "mobile", visits: 1 }]);
	});

	it("falls back to browsers for an unknown view", async () => {
		expect(await list("devices", "nonsense")).toEqual(await list("devices", "browser"));
	});
});

describe("locations", () => {
	it("ranks countries, defaulting a missing country to XX", async () => {
		const response = await list<{ country: string; region: string; city: string; visits: number }>("locations", "country");
		expect(response.rows.map(row => row.country).sort()).toEqual(["CH", "US", "XX"]);
		expect(response.rows[0]).toMatchObject({ region: "", city: "" });
		expect(response.total).toBe(3);
	});

	it("ranks regions, leaving out Visits without one", async () => {
		const response = await list<{ country: string; region: string }>("locations", "region");
		expect(response.rows.map(row => `${row.country}-${row.region}`).sort()).toEqual(["CH-BE", "US-CA"]);
	});

	it("ranks cities, decoding the city header", async () => {
		const response = await list<{ city: string }>("locations", "city");
		expect(response.rows.map(row => row.city).sort()).toEqual(["Bern", "San Francisco"]);
		expect(response.total).toBe(2);
	});

	it("falls back to countries for an unknown view", async () => {
		expect(await list("locations", "nonsense")).toEqual(await list("locations", "country"));
	});
});

describe("activity", () => {
	it("ranks Events by count", async () => {
		const response = await list("activity");
		expect(response).toMatchObject({ rows: [{ name: "signup", count: 2 }, { name: "download", count: 1 }] });
		expect(response).not.toHaveProperty("total");
	});

	it("drops an Event from a Visitor with no Visit", async () => {
		const other = await createSite();
		await collect({ site_id: other.id, name: "orphan" }, { ip: uniqueIp() });
		await new Promise(resolve => setTimeout(resolve, 300));
		expect((await $fetch<{ rows: unknown[] }>(`/api/sites/${other.id}/activity?range=today`)).rows).toEqual([]);
	});
});
