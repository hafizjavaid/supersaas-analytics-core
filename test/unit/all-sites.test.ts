import { describe, expect, it } from "vitest";
import { absoluteChange, overviewTotalCells, siteOverviewCells } from "../../app/utils/all-sites";
import type { SiteOverview } from "../../shared/types/analytics";

const site = { id: "s1", organizationId: "o1", name: "Blog", domain: "blog.example.com", timezone: "UTC", excludedIps: [], excludedPaths: [], createdAt: 0 };

describe("absoluteChange", () => {
	it("shows a rise as a green plus", () => {
		expect(absoluteChange(15, 3)).toEqual({ label: "+12", tone: "success" });
	});

	it("shows a fall as a red minus", () => {
		expect(absoluteChange(2, 5)).toEqual({ label: "−3", tone: "error" });
	});

	it("shows no change as a grey zero", () => {
		expect(absoluteChange(4, 4)).toEqual({ label: "0", tone: "neutral" });
	});

	it("compacts large changes", () => {
		expect(absoluteChange(12_400, 0).label).toBe("+12.4K");
	});
});

describe("overview cells", () => {
	const entry: SiteOverview = {
		site,
		visitors: 3,
		pageviews: 1_500,
		previous: { visitors: 5, pageviews: 1_500, revenue: 0, searchClicks: 0 },
		searchClicks: null,
		revenue: null,
		currency: null,
		live: 1,
		trend: [
			{ timestamp: 0, visitors: 1, pageviews: 700 },
			{ timestamp: 3_600_000, visitors: 2, pageviews: 800 },
		],
	};

	it("gives a Site a Visitors and a Pageviews cell with their change and sparkline values", () => {
		expect(siteOverviewCells(entry)).toEqual([
			{ key: "visitors", label: "Visitors", value: "3", period: "24h", change: { label: "−2", tone: "error" }, trend: [1, 2] },
			{ key: "pageviews", label: "Pageviews", value: "1.5K", period: "24h", change: { label: "0", tone: "neutral" }, trend: [700, 800] },
		]);
	});

	it("totals Visitors, Pageviews and Live without a change on Live", () => {
		const cells = overviewTotalCells({ visitors: 10, pageviews: 20, live: 4, previous: { visitors: 8, pageviews: 25 }, revenue: [], searchClicks: null });
		expect(cells.map(cell => [cell.label, cell.value, cell.change?.label])).toEqual([
			["Visitors", "10", "+2"],
			["Pageviews", "20", "−5"],
			["Live", "4", undefined],
		]);
	});

	it("adds Revenue once the Site has a Revenue connection", () => {
		const cells = siteOverviewCells({ ...entry, revenue: 4900, currency: "usd", previous: { ...entry.previous, revenue: 1900 } });
		expect(cells.at(-1)).toEqual({ key: "revenue", label: "Revenue", value: "$49", period: "24h", change: { label: "+$30", tone: "success" } });
	});

	it("adds Search clicks over 28 days once the Site has search data", () => {
		const cells = siteOverviewCells({ ...entry, searchClicks: 1_240, previous: { ...entry.previous, searchClicks: 1_000 } });
		expect(cells.at(-1)).toEqual({ key: "searchClicks", label: "Search clicks", value: "1.2K", period: "28d", change: { label: "+240", tone: "success" } });
	});

	it("totals Search clicks across Sites, before Live", () => {
		const cells = overviewTotalCells({ visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 }, revenue: [], searchClicks: 320 });
		expect(cells.map(cell => cell.key)).toEqual(["visitors", "pageviews", "searchClicks", "live"]);
		expect(cells.find(cell => cell.key === "searchClicks")).toEqual({ key: "searchClicks", label: "Search clicks", value: "320", period: "28d" });
	});

	it("totals Revenue per currency", () => {
		const cells = overviewTotalCells({ visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 }, revenue: [{ currency: "usd", amount: 1900 }, { currency: "eur", amount: 500 }], searchClicks: null });
		expect(cells.find(cell => cell.key === "revenue")).toEqual({ key: "revenue", label: "Revenue", value: "$19 · €5", period: "24h" });
	});
});
