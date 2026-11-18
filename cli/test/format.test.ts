import { describe, expect, it } from "vitest";
import type { FunnelReport, Goals, Summary, Totals, TopList } from "../src/api-types.js";
import { formatFunnelReport, formatGoals, formatLive, formatSites, formatSnippet, formatSummary, formatTopList } from "../src/format.js";

const site = { id: "s1", name: "Docs", domain: "docs.example.com" };
const range = { from: "2026-11-01", to: "2026-11-14", hours: null };

const totals: Totals = {
	visitors: 1234,
	visits: 1500,
	pageviews: 4200,
	bounceRate: 0.45,
	avgVisitDurationSeconds: 125,
	conversionRate: null,
	revenue: null,
};

describe("formatSites", () => {
	it("aligns one row per Site under a header", () => {
		expect(formatSites({ sites: [
			{ ...site, timezone: "Europe/Zurich", createdAt: 0 },
			{ id: "s22", name: "Shop", domain: "shop.example.com", timezone: "UTC", createdAt: 0 },
		] })).toBe([
			"ID   Name  Domain            Timezone",
			"s1   Docs  docs.example.com  Europe/Zurich",
			"s22  Shop  shop.example.com  UTC",
		].join("\n"));
	});

	it("says so when there are no Sites", () => {
		expect(formatSites({ sites: [] })).toBe("No Sites yet. Add one in the dashboard.");
	});
});

describe("formatSummary", () => {
	it("shows each total beside the Previous period and the change", () => {
		const summary: Summary = { site, range, currency: null, current: totals, previous: { ...totals, visitors: 1000, bounceRate: 0.5, avgVisitDurationSeconds: 125 } };
		expect(formatSummary(summary)).toBe([
			"Docs (docs.example.com), 2026-11-01 to 2026-11-14",
			"",
			"Metric              Value  Previous  Change",
			"Visitors            1,234     1,000    +23%",
			"Visits              1,500     1,500      0%",
			"Pageviews           4,200     4,200      0%",
			"Bounce rate           45%       50%  -5 pts",
			"Avg visit duration  2m 5s     2m 5s      0%",
		].join("\n"));
	});

	it("adds Conversion rate with Goals and Revenue in the connection's currency", () => {
		const current = { ...totals, conversionRate: 0.031, revenue: 490_00 };
		const summary: Summary = { site, range: { ...range, hours: 24 }, currency: "USD", current, previous: { ...current, revenue: 0 } };
		const text = formatSummary(summary);
		expect(text.split("\n")[0]).toBe("Docs (docs.example.com), last 24 hours");
		expect(text).toContain("Conversion rate        3.1%      3.1%   0 pts");
		expect(text).toContain("Revenue             $490.00     $0.00     new");
	});
});

describe("formatTopList", () => {
	it("ranks rows with their share of the total", () => {
		const topList: TopList = { site, range: { ...range, from: "2026-11-14" }, dimension: "utm_campaign", metric: "visits", total: 40, rows: [{ label: "launch", value: 30 }, { label: "newsletter", value: 2 }] };
		expect(formatTopList(topList)).toBe([
			"Docs (docs.example.com), 2026-11-14",
			"",
			"UTM campaign  Visits  Share",
			"launch            30    75%",
			"newsletter         2     5%",
		].join("\n"));
	});

	it("says so when the Range has no data", () => {
		expect(formatTopList({ site, range, dimension: "page", metric: "pageviews", total: 0, rows: [] })).toContain("No data in this Range.");
	});
});

describe("formatLive", () => {
	it("adds a total under several Sites", () => {
		expect(formatLive([{ site, visitors: 3 }, { site: { id: "s2", name: "Shop", domain: "shop.example.com" }, visitors: 12 }])).toBe([
			"Site   Domain            Live visitors",
			"Docs   docs.example.com              3",
			"Shop   shop.example.com             12",
			"Total                               15",
		].join("\n"));
	});
});

describe("formatGoals", () => {
	it("lists each Goal and how many Visitors completed any", () => {
		const goals: Goals = { site, range, visitors: 200, converted: 30, conversionRate: 0.15, goals: [
			{ id: "g1", name: "Signup", kind: "event", value: "signup", conversions: 40, visitors: 25, conversionRate: 0.125 },
		] };
		expect(formatGoals(goals).split("\n").slice(2)).toEqual([
			"Goal    Conversions  Visitors  Rate",
			"Signup           40        25   13%",
			"",
			"30 of 200 Visitors completed a Goal (15%).",
		]);
	});

	it("points to Settings when the Site has no Goals", () => {
		expect(formatGoals({ site, range, visitors: 10, converted: 0, conversionRate: 0, goals: [] })).toContain("No Goals on this Site");
	});
});

describe("formatFunnelReport", () => {
	it("shows each step's Visitors, how many continued and dropped", () => {
		const report: FunnelReport = {
			site,
			range,
			funnel: { id: "f1", name: "Pricing", window: "24h", steps: [] },
			visitors: 50,
			entered: 10,
			completed: 6,
			enteredRate: 0.2,
			conversionRate: 0.6,
			steps: [
				{ label: "Home", visitors: 10, entryRate: 1, continueRate: null, dropped: 4 },
				{ label: "/pricing", visitors: 6, entryRate: 0.6, continueRate: 0.6, dropped: 0 },
			],
		};
		expect(formatFunnelReport(report)).toBe([
			"Pricing (24h window), Docs (docs.example.com), 2026-11-01 to 2026-11-14",
			"",
			"Step      Visitors  Continued  Dropped",
			"Home            10          -        4",
			"/pricing         6        60%        0",
			"",
			"10 of 50 Visitors entered (20%), 6 completed (60%).",
		].join("\n"));
	});
});

describe("formatSnippet", () => {
	it("points the script at the server's sd.js", () => {
		expect(formatSnippet("https://analytics.example.com/", "s1")).toBe("<script defer data-site=\"s1\" src=\"https://analytics.example.com/sd.js\"></script>");
	});
});
