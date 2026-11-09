import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, anonymous$fetch, anonymousFetch, collect, createOrganization, createSite, createSiteAs, fetch, postAs, signUp, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { OutboundLinkDetail, OutboundLinkStats, ShareLink, SharedDashboard, Site } from "#layers/core/shared/types/analytics";

await setupServer();

const DAY = 86_400;
const GITHUB = "https://github.com/owner/repo";
const DOCS = "https://docs.example.org/guide";
const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function visitor(userAgent: string, country: string) {
	return { ip: uniqueIp(), userAgent, headers: { "x-vercel-ip-country": country } };
}

function linkStats(siteId: string, query = "range=today") {
	return $fetch<OutboundLinkStats>(`/api/sites/${siteId}/outbound-links?${query}`);
}

function linkDetail(siteId: string, url: string, query = "range=today") {
	return $fetch<OutboundLinkDetail>(`/api/sites/${siteId}/outbound-links/detail?${query}&url=${encodeURIComponent(url)}`);
}

function rowFor(stats: OutboundLinkStats, url: string) {
	return stats.rows.find(row => row.url === url);
}

function sum(values: number[]) {
	return values.reduce((total, value) => total + value, 0);
}

async function createShareLink(siteId: string, body: Record<string, unknown>) {
	const response = await fetch(`/api/sites/${siteId}/share-links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
	expect(response.status).toBe(201);
	return await response.json() as ShareLink;
}

let site: Site;

// carol (Chrome, US): / then GitHub, all moved to yesterday
// alice (Chrome, CH): / then /pricing, GitHub twice and the docs from /pricing
// bob (Safari iPhone, US): /blog then GitHub
beforeAll(async () => {
	site = await createSite({ domain: "links.example.com", timezone: timezoneAwayFromMidnight() });
	const carol = visitor(CHROME_WINDOWS, "US");
	const alice = visitor(CHROME_WINDOWS, "CH");
	const bob = visitor(SAFARI_IPHONE, "US");

	await collect({ site_id: site.id, path: "/" }, carol);
	await waitForPageviews(site.id, 1);
	await collect({ site_id: site.id, outbound_url: GITHUB }, carol);
	await waitFor(() => linkStats(site.id), stats => stats.summary.clicks === 1);
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [DAY, DAY, site.id] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, site.id] },
		{ sql: "UPDATE outbound_links SET timestamp = timestamp - ? WHERE site_id = ?", args: [DAY, site.id] },
	]);

	await collect({ site_id: site.id, path: "/" }, alice);
	await collect({ site_id: site.id, path: "/blog" }, bob);
	await waitForPageviews(site.id, 2);
	await collect({ site_id: site.id, path: "/pricing" }, alice);
	await waitForPageviews(site.id, 3);
	await collect({ site_id: site.id, outbound_url: GITHUB }, alice);
	await collect({ site_id: site.id, outbound_url: `${GITHUB}?tab=readme` }, alice);
	await collect({ site_id: site.id, outbound_url: DOCS }, alice);
	await collect({ site_id: site.id, outbound_url: GITHUB }, bob);
	await waitFor(() => linkStats(site.id), stats => stats.summary.clicks === 4);
});

describe("Outbound link stats", () => {
	it("sums up clicks, unique clicks and links", async () => {
		const { summary, total } = await linkStats(site.id);
		expect(summary).toEqual({ clicks: 4, uniqueClicks: 3, links: 2, avgClicksPerLink: 2 });
		expect(total).toBe(2);
	});

	it("ranks links by clicks, with their Visitors against the previous period and an hourly trend", async () => {
		const stats = await linkStats(site.id);
		expect(stats.rows.map(row => row.url)).toEqual([GITHUB, DOCS]);
		expect(rowFor(stats, GITHUB)).toMatchObject({ clicks: 3, visitors: 2, previousVisitors: 1 });
		expect(rowFor(stats, DOCS)).toMatchObject({ clicks: 1, visitors: 1, previousVisitors: 0 });

		const trend = rowFor(stats, GITHUB)!.trend;
		expect(trend.length).toBeGreaterThan(0);
		expect(trend.length).toBeLessThanOrEqual(25);
		expect(sum(trend)).toBe(3);
	});

	it("covers past days from raw rows, with a daily trend", async () => {
		const stats = await linkStats(site.id, "range=7d");
		expect(stats.summary).toMatchObject({ clicks: 5, uniqueClicks: 4, links: 2 });
		const github = rowFor(stats, GITHUB)!;
		expect(github).toMatchObject({ clicks: 4, visitors: 3 });
		expect(github.trend).toHaveLength(7);
		expect(github.trend.slice(-2)).toEqual([1, 3]);
	});

	it("narrows to the Visitors matching the Filters", async () => {
		const stats = await linkStats(site.id, `range=today&f=${encodeURIComponent("country:US")}`);
		expect(stats.summary).toMatchObject({ clicks: 1, uniqueClicks: 1, links: 1 });
		expect(stats.rows.map(row => row.url)).toEqual([GITHUB]);
	});

	it("is empty for a Site without clicks", async () => {
		const empty = await createSite();
		expect(await linkStats(empty.id)).toEqual({ summary: { clicks: 0, uniqueClicks: 0, links: 0, avgClicksPerLink: 0 }, rows: [], total: 0 });
	});
});

describe("one Outbound link", () => {
	it("reports clicks, unique clicks, clicks per day, countries, clicked-from pages and devices", async () => {
		const detail = await linkDetail(site.id, GITHUB);
		expect(detail).toMatchObject({
			url: GITHUB,
			clicks: 3,
			uniqueClicks: 2,
			clicksPerDay: 3,
			topCountry: "CH",
			countries: [{ value: "CH", clicks: 2 }, { value: "US", clicks: 1 }],
			pages: [{ value: "/pricing", clicks: 2 }, { value: "/blog", clicks: 1 }],
			devices: [{ value: "desktop", clicks: 2 }, { value: "mobile", clicks: 1 }],
		});
		expect(sum(detail.trend)).toBe(3);
	});

	it("averages clicks over the days of the Range", async () => {
		const detail = await linkDetail(site.id, GITHUB, "range=7d");
		expect(detail.clicks).toBe(4);
		expect(detail.clicksPerDay).toBeCloseTo(4 / 7);
		expect(detail.pages).toEqual([{ value: "/pricing", clicks: 2 }, { value: "/", clicks: 1 }, { value: "/blog", clicks: 1 }]);
	});

	it("answers zeros for a link without clicks, and 400 without a URL", async () => {
		expect(await linkDetail(site.id, "https://never.example.net/")).toMatchObject({ clicks: 0, uniqueClicks: 0, clicksPerDay: 0, topCountry: null, countries: [], pages: [], devices: [] });
		expect((await fetch(`/api/sites/${site.id}/outbound-links/detail?range=today`)).status).toBe(400);
	});

	it("is only for Members of the Site's Organization", async () => {
		const stranger = await signUp("stranger");
		await createOrganization(stranger);
		expect((await stranger.fetch(`/api/sites/${site.id}/outbound-links?range=today`)).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/outbound-links/detail?range=today&url=${encodeURIComponent(GITHUB)}`)).status).toBe(404);
	});
});

describe("link Share links", () => {
	it("creates a Share link scoped to one destination URL", async () => {
		const link = await createShareLink(site.id, { name: "GitHub sponsor", outboundUrl: GITHUB });
		expect(link).toMatchObject({ name: "GitHub sponsor", outboundUrl: GITHUB, hasPassword: false });
		expect(await $fetch<ShareLink[]>(`/api/sites/${site.id}/share-links`)).toContainEqual(link);

		const shared = await anonymous$fetch<SharedDashboard>(`/api/share/${link.token}`);
		expect(shared).toEqual({ locked: false, site: { id: site.id, name: site.name, domain: site.domain, timezone: site.timezone }, outboundUrl: GITHUB });
	});

	it("shows only that link's stats, whatever URL is asked for", async () => {
		const link = await createShareLink(site.id, { name: "Sponsor", outboundUrl: GITHUB });
		const detail = await anonymous$fetch<OutboundLinkDetail>(`/api/share/${link.token}/outbound-link?range=today&url=${encodeURIComponent(DOCS)}`);
		expect(detail).toMatchObject({ url: GITHUB, clicks: 3, uniqueClicks: 2, topCountry: "CH" });
	});

	it("never shows the dashboard through a link Share link", async () => {
		const link = await createShareLink(site.id, { name: "Sponsor", outboundUrl: GITHUB });
		for (const report of ["summary", "timeseries", "pages", "page-stats", "funnels"]) {
			expect((await anonymousFetch(`/api/share/${link.token}/${report}?range=today`)).status, report).toBe(404);
		}
	});

	it("never shows link stats through a dashboard Share link", async () => {
		const link = await createShareLink(site.id, { name: "Dashboard" });
		expect(link.outboundUrl).toBeNull();
		expect((await anonymousFetch(`/api/share/${link.token}/outbound-link?range=today&url=${encodeURIComponent(GITHUB)}`)).status).toBe(404);
	});

	it("asks for the password first when one is set", async () => {
		const link = await createShareLink(site.id, { name: "Locked sponsor", outboundUrl: GITHUB, password: "s3cret-pass" });
		expect(await anonymous$fetch<SharedDashboard>(`/api/share/${link.token}`)).toEqual({ locked: true });
		expect((await anonymousFetch(`/api/share/${link.token}/outbound-link?range=today`)).status).toBe(401);
	});

	it("rejects a destination that is not a web URL", async () => {
		for (const outboundUrl of ["not a url", "javascript:alert(1)", "mailto:someone@example.com"]) {
			const response = await fetch(`/api/sites/${site.id}/share-links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bad", outboundUrl }) });
			expect(response.status, outboundUrl).toBe(400);
		}
	});

	it("lets Admins share a link, but not Viewers", async () => {
		const owner = await signUp("owner");
		const organization = await createOrganization(owner);
		const ownSite = await createSiteAs(owner, organization);
		const admin = await addMember(owner, organization.id, "admin");
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await postAs(admin, `/api/sites/${ownSite.id}/share-links`, { name: "Sponsor", outboundUrl: GITHUB })).status).toBe(201);
		expect((await postAs(viewer, `/api/sites/${ownSite.id}/share-links`, { name: "Sponsor", outboundUrl: GITHUB })).status).toBe(403);
	});
});
