import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { EventProperties, Site, TopEventRow } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function events(siteId: string, query = "range=today") {
	return $fetch<{ rows: TopEventRow[] }>(`/api/sites/${siteId}/activity?${query}`);
}

function properties(siteId: string, query: string) {
	return $fetch<EventProperties>(`/api/sites/${siteId}/event-properties?${query}`);
}

async function eventCount(siteId: string, query = "range=today") {
	return (await events(siteId, query)).rows.reduce((sum, row) => sum + row.count, 0);
}

let site: Site;

// alice (Chrome): signup on /pricing {plan: pro, cycle: yearly}, signup on /pricing {plan: free}, download on /docs {qty: 2, gift: true}
// bob (Safari):   signup on / {plan: pro}, ping with no page
beforeAll(async () => {
	site = await createSite({ domain: "events.example.com" });
	const alice = { ip: uniqueIp() };
	const bob = { ip: uniqueIp(), userAgent: SAFARI_IPHONE };

	await collect({ site_id: site.id, path: "/" }, alice);
	await collect({ site_id: site.id, path: "/" }, bob);
	await waitForPageviews(site.id, 2);

	await collect({ site_id: site.id, name: "signup", path: "/pricing", props: { plan: "pro", cycle: "yearly" } }, alice);
	await collect({ site_id: site.id, name: "signup", path: "/pricing", props: { plan: "free" } }, alice);
	await collect({ site_id: site.id, name: "download", path: "/docs", props: { qty: 2, gift: true } }, alice);
	await collect({ site_id: site.id, name: "signup", path: "/", props: { plan: "pro" } }, bob);
	await collect({ site_id: site.id, name: "ping" }, bob);
	await waitFor(() => eventCount(site.id), count => count === 5);
});

describe("Events list", () => {
	it("ranks each Event per page it fired on", async () => {
		expect((await events(site.id)).rows).toEqual([
			{ name: "signup", path: "/pricing", count: 2 },
			{ name: "download", path: "/docs", count: 1 },
			{ name: "ping", path: null, count: 1 },
			{ name: "signup", path: "/", count: 1 },
		]);
	});

	it("narrows the rows with Filters", async () => {
		const response = await events(site.id, `range=today&f=${encodeURIComponent("browser:Safari")}`);
		expect(response.rows).toEqual([
			{ name: "ping", path: null, count: 1 },
			{ name: "signup", path: "/", count: 1 },
		]);
	});
});

describe("Event properties", () => {
	it("breaks an Event down by property key and value across its pages", async () => {
		expect(await properties(site.id, "range=today&name=signup")).toEqual({
			name: "signup",
			path: null,
			count: 3,
			properties: [
				{ key: "plan", count: 3, values: [{ value: "pro", count: 2 }, { value: "free", count: 1 }] },
				{ key: "cycle", count: 1, values: [{ value: "yearly", count: 1 }] },
			],
		});
	});

	it("limits the breakdown to one page", async () => {
		const response = await properties(site.id, "range=today&name=signup&path=%2Fpricing");
		expect(response).toMatchObject({ path: "/pricing", count: 2 });
		expect(response.properties[0]).toEqual({ key: "plan", count: 2, values: [{ value: "free", count: 1 }, { value: "pro", count: 1 }] });
	});

	it("reads an empty path as an Event sent without a page", async () => {
		expect(await properties(site.id, "range=today&name=ping&path=")).toMatchObject({ path: "", count: 1, properties: [] });
		expect((await properties(site.id, "range=today&name=signup&path=")).count).toBe(0);
	});

	it("shows numbers and booleans as text", async () => {
		const response = await properties(site.id, "range=today&name=download");
		expect(response.properties).toEqual([
			{ key: "gift", count: 1, values: [{ value: "true", count: 1 }] },
			{ key: "qty", count: 1, values: [{ value: "2", count: 1 }] },
		]);
	});

	it("applies Filters", async () => {
		const response = await properties(site.id, `range=today&name=signup&f=${encodeURIComponent("browser:Safari")}`);
		expect(response).toMatchObject({ count: 1, properties: [{ key: "plan", count: 1, values: [{ value: "pro", count: 1 }] }] });
	});

	it("answers an unknown Event with nothing", async () => {
		expect(await properties(site.id, "range=today&name=nothing")).toEqual({ name: "nothing", path: null, count: 0, properties: [] });
	});

	it("needs an Event name", async () => {
		expect((await fetch(`/api/sites/${site.id}/event-properties?range=today`)).status).toBe(400);
	});
});

async function siteWithEventsDaysAgo(days: number, hits: { name: string; path: string; props: Record<string, string> }[]) {
	const pastSite = await createSite({ timezone: timezoneAwayFromMidnight() });
	const visitor = { ip: uniqueIp() };
	await collect({ site_id: pastSite.id, path: "/" }, visitor);
	await waitForPageviews(pastSite.id, 1);
	for (const hit of hits) {
		await collect({ site_id: pastSite.id, ...hit }, visitor);
	}
	await waitFor(() => eventCount(pastSite.id), count => count === hits.length);

	const seconds = days * DAY;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [seconds, seconds, pastSite.id] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, pastSite.id] },
		{ sql: "UPDATE events SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, pastSite.id] },
	]);
	return pastSite;
}

describe("past days", () => {
	it("keeps each Event's page in the Rollup", async () => {
		const pastSite = await siteWithEventsDaysAgo(1, [
			{ name: "signup", path: "/pricing", props: { plan: "team" } },
			{ name: "signup", path: "/", props: { plan: "team" } },
		]);
		const today = (await getSummary(pastSite.id)).range.today;
		await $fetch("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload: { date: shiftDate(today, -1) } } });
		await testDb.execute({ sql: "DELETE FROM events WHERE site_id = ?", args: [pastSite.id] });

		expect((await events(pastSite.id, "range=7d")).rows).toEqual([
			{ name: "signup", path: "/", count: 1 },
			{ name: "signup", path: "/pricing", count: 1 },
		]);
	});

	it("reads properties of past days from raw rows", async () => {
		const pastSite = await siteWithEventsDaysAgo(3, [{ name: "signup", path: "/", props: { plan: "team" } }]);

		expect((await properties(pastSite.id, "range=7d&name=signup")).properties).toEqual([
			{ key: "plan", count: 1, values: [{ value: "team", count: 1 }] },
		]);
		expect((await properties(pastSite.id, "range=today&name=signup")).count).toBe(0);
	});
});
