import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Site } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;
const ROLLUP_TABLES = ["daily_summary", "daily_pages", "daily_sources", "daily_devices", "daily_locations", "daily_outbound_links", "daily_events"];

function runRollup(payload: Record<string, string> = {}) {
	return $fetch<{ result: { siteId: string; date: string }[] }>("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload } });
}

// Moves a Site's raw rows back one day, keeping the time of day, so they land on yesterday in the Site's timezone.
async function moveRawRowsToYesterday(siteId: string) {
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [DAY, DAY, siteId] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, siteId] },
		{ sql: "UPDATE outbound_links SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, siteId] },
		{ sql: "UPDATE events SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, siteId] },
	]);
}

async function rollupRows(siteId: string) {
	const rows: Record<string, string[]> = {};
	for (const table of ROLLUP_TABLES) {
		const result = await testDb.execute({ sql: `SELECT * FROM ${table} WHERE site_id = ?`, args: [siteId] });
		rows[table] = result.rows.map(row => JSON.stringify({ ...row })).sort();
	}
	return rows;
}

let site: Site;
let yesterday: string;

beforeAll(async () => {
	site = await createSite({ domain: "rollup.example.com", timezone: timezoneAwayFromMidnight() });
	const alice = { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH", "x-vercel-ip-city": "Bern" } };
	const bob = { ip: uniqueIp(), userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0" };

	await collect({ site_id: site.id, path: "/", referrer: "www.google.com", utm_source: "newsletter" }, alice);
	await collect({ site_id: site.id, path: "/docs" }, bob);
	await waitForPageviews(site.id, 2);
	await collect({ site_id: site.id, path: "/pricing" }, alice);
	await collect({ site_id: site.id, outbound_url: "https://github.com/owner/repo" }, alice);
	await collect({ site_id: site.id, name: "signup" }, alice);
	await waitForPageviews(site.id, 3);
	await waitFor(() => $fetch<{ rows: unknown[] }>(`/api/sites/${site.id}/activity?range=today`), response => response.rows.length === 1);

	const { range } = await getSummary(site.id);
	yesterday = shiftDate(range.today, -1);
	await moveRawRowsToYesterday(site.id);
});

describe("rollup:daily", () => {
	it("rolls up the given date for every Site", async () => {
		const { result } = await runRollup({ date: yesterday });
		expect(result).toContainEqual({ siteId: site.id, date: yesterday });
	});

	it("reports the rolled-up day in past Ranges", async () => {
		const summary = await getSummary(site.id, "range=7d");
		expect(summary).toMatchObject({ visitors: 2, visits: 2, pageviews: 3, bounceRate: 0.5 });
		expect((await getSummary(site.id, "range=today")).pageviews).toBe(0);
	});

	it("reports the rolled-up day in every ranked list", async () => {
		const query = `range=7d`;
		const pages = await $fetch<{ rows: { path: string; count: number }[] }>(`/api/sites/${site.id}/pages?${query}&view=entered`);
		expect(pages.rows).toEqual(expect.arrayContaining([{ path: "/", count: 1 }, { path: "/docs", count: 1 }]));
		const channels = await $fetch<{ rows: { key: string }[] }>(`/api/sites/${site.id}/sources?${query}&view=channel`);
		expect(channels.rows).toEqual(expect.arrayContaining([{ key: "email", label: "Email", visits: 1 }, { key: "direct", label: "Direct", visits: 1 }]));
		const links = await $fetch<{ total: number }>(`/api/sites/${site.id}/pages?${query}&view=outbound`);
		expect(links.total).toBe(1);
		const cities = await $fetch<{ rows: { city: string }[] }>(`/api/sites/${site.id}/locations?${query}&view=city`);
		expect(cities.rows).toMatchObject([{ country: "CH", city: "Bern", visits: 1 }]);
		const browsers = await $fetch<{ rows: { value: string }[] }>(`/api/sites/${site.id}/devices?${query}`);
		expect(browsers.rows.map(row => row.value).sort()).toEqual(["Chrome", "Firefox"]);
		const events = await $fetch<{ rows: unknown[] }>(`/api/sites/${site.id}/activity?${query}`);
		expect(events.rows).toEqual([{ name: "signup", path: null, count: 1 }]);
	});

	it("merges Rollup rows with today's raw rows per key", async () => {
		await collect({ site_id: site.id, path: "/docs" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 1);

		const pages = await $fetch<{ rows: { path: string; count: number }[]; total: number }>(`/api/sites/${site.id}/pages?range=7d`);
		expect(pages.rows).toContainEqual({ path: "/docs", count: 2 });
		expect(pages.total).toBe(4);
	});

	it("gives identical rows when a day is rolled up again", async () => {
		const before = await rollupRows(site.id);
		expect(before.daily_summary).toHaveLength(1);
		await runRollup({ date: yesterday });
		expect(await rollupRows(site.id)).toEqual(before);
	});

	it("defaults to each Site's previous local day", async () => {
		const { result } = await runRollup();
		expect(result).toContainEqual({ siteId: site.id, date: yesterday });
	});

	it("rejects a malformed date", async () => {
		const response = await fetch("/_nitro/tasks/rollup:daily", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ payload: { date: "yesterday" } }),
		});
		expect(response.ok).toBe(false);
	});
});
