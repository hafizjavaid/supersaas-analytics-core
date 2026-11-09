import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, getSummary, testDb, timezoneAwayFromMidnight, uniqueIp, waitForPageviews } from "./helpers";
import type { Site, SummaryWithPrevious, TopListResult, TopSourceRow } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;

function query(range: string, view: string, filters: string[] = []) {
	return [`range=${range}`, `view=${view}`, ...filters.map(filter => `f=${encodeURIComponent(filter)}`)].join("&");
}

function sources(site: Site, view: string, range = "today", filters: string[] = []) {
	return $fetch<TopListResult<TopSourceRow>>(`/api/sites/${site.id}/sources?${query(range, view, filters)}`);
}

function summary(site: Site, filters: string[], range = "today") {
	return $fetch<SummaryWithPrevious>(`/api/sites/${site.id}/summary?${query(range, "", filters)}`);
}

// Seven Visits: three from AI assistants (one with the referrer hidden), one Paid, one Search, one Referral, one Direct.
async function arrangeVisits(site: Site) {
	const hits = [
		{ referrer: "chatgpt.com" },
		{ referrer: null, utm_source: "chatgpt.com" },
		{ referrer: "www.perplexity.ai" },
		{ referrer: "www.google.com", utm_source: "google", utm_medium: "cpc", utm_campaign: "summer", utm_term: "web analytics", utm_content: "ad-a" },
		{ referrer: "bing.com" },
		{ referrer: "github.com" },
		{ referrer: null },
	];
	for (const hit of hits) {
		await collect({ site_id: site.id, path: "/", ...hit }, { ip: uniqueIp() });
	}
	await waitForPageviews(site.id, hits.length);
}

async function rollUpAsYesterday(site: Site) {
	const yesterday = shiftDate((await getSummary(site.id)).range.today, -1);
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [DAY, DAY, site.id] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, site.id] },
	]);
	await $fetch("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload: { date: yesterday } } });
}

const CHANNEL_ROWS = [
	{ key: "ai", label: "AI assistant", visits: 3 },
	{ key: "paid", label: "Paid", visits: 1 },
	{ key: "search", label: "Search", visits: 1 },
	{ key: "referral", label: "Referral", visits: 1 },
	{ key: "direct", label: "Direct", visits: 1 },
];

const AI_ROWS = [
	{ key: "chatgpt.com", label: "ChatGPT", referrerDomain: "chatgpt.com", visits: 2 },
	{ key: "perplexity.ai", label: "Perplexity", referrerDomain: "perplexity.ai", visits: 1 },
];

let site: Site;
let pastSite: Site;

beforeAll(async () => {
	site = await createSite({ domain: "channels.example.com" });
	pastSite = await createSite({ domain: "past-channels.example.com", timezone: timezoneAwayFromMidnight() });
	await arrangeVisits(site);
	await arrangeVisits(pastSite);
	await rollUpAsYesterday(pastSite);
});

describe("Sources by Channel", () => {
	it("groups today's Visits into Channels", async () => {
		const response = await sources(site, "channel");
		expect(response.rows[0]).toEqual(CHANNEL_ROWS[0]);
		expect(response.rows).toEqual(expect.arrayContaining(CHANNEL_ROWS));
		expect(response.total).toBe(7);
	});

	it("is the default view", async () => {
		expect(await sources(site, "")).toEqual(await sources(site, "channel"));
	});

	it("groups AI assistant Visits by assistant, including those that only sent a UTM source", async () => {
		expect((await sources(site, "ai")).rows).toEqual(AI_ROWS);
	});

	it.each([
		["campaign", "summer"],
		["medium", "cpc"],
		["term", "web analytics"],
		["content", "ad-a"],
	])("ranks the UTM %s", async (view, value) => {
		expect(await sources(site, view)).toEqual(expect.objectContaining({ rows: [{ key: value, label: value, visits: 1 }], total: 1 }));
	});

	it("reads past days from the Rollup", async () => {
		const response = await sources(pastSite, "channel", "7d");
		expect(response.rows).toEqual(expect.arrayContaining(CHANNEL_ROWS));
		expect(response.total).toBe(7);
		expect((await sources(pastSite, "ai", "7d")).rows).toEqual(AI_ROWS);
		expect((await sources(pastSite, "term", "7d")).rows).toEqual([{ key: "web analytics", label: "web analytics", visits: 1 }]);
		expect((await sources(pastSite, "channel", "today")).rows).toEqual([]);
	});
});

describe("Channel Filters", () => {
	it.each([
		[["channel:ai"], 3],
		[["channel:paid"], 1],
		[["channel:direct"], 1],
		[["ai_assistant:chatgpt.com"], 2],
		[["ai_assistant:perplexity.ai"], 1],
		[["ai_assistant:claude.ai"], 0],
		[["utm_term:web analytics"], 1],
		[["utm_content:ad-a"], 1],
		[["channel:search", "utm_term:web analytics"], 0],
	])("counts only the Visits matching %j", async (filters, visitors) => {
		expect((await summary(site, filters)).visitors).toBe(visitors);
		expect((await summary(pastSite, filters, "7d")).visitors).toBe(visitors);
	});

	it("narrows the other Sources lists", async () => {
		const referrers = await sources(site, "referrer", "today", ["channel:ai"]);
		expect(referrers.rows.map(row => row.key).sort()).toEqual(["(direct)", "chatgpt.com", "perplexity.ai"]);
		expect((await sources(site, "channel", "today", ["ai_assistant:chatgpt.com"])).rows).toEqual([{ key: "ai", label: "AI assistant", visits: 2 }]);
	});

	it("ignores an unknown Channel", async () => {
		expect((await summary(site, ["channel:AI assistant"])).visitors).toBe(7);
	});
});
