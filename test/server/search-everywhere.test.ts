import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, collect, createOrganization, createSiteAs, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { BING_API_KEY, BING_SITE, fakeBingDates, fakeBingTraffic, fakeGoogleDay, fakeGoogleLatest, GOOGLE_CODE, GOOGLE_PROPERTY, utcToday } from "./search";
import type { AllSitesOverview, PageStats, Site } from "#layers/core/shared/types/analytics";
import type { SearchConnection, SearchConnections, SearchInsights, SearchProperty, SearchReport } from "#layers/core/shared/types/search";
import { dateRangeList, shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

function connectionsPath(siteId: string) {
	return `/api/sites/${siteId}/search-connections`;
}

function send(user: TestUser, path: string, method: string, body: unknown) {
	return user.fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function connectBing(user: TestUser, siteId: string, apiKey = BING_API_KEY) {
	return send(user, `${connectionsPath(siteId)}/bing`, "PUT", { apiKey });
}

async function connectGoogle(siteId: string) {
	const authorize = await owner.fetch(`${connectionsPath(siteId)}/google/authorize`, { redirect: "manual" });
	const state = new URL(authorize.headers.get("location")!).searchParams.get("state")!;
	await owner.fetch(`/api/search-connections/google/callback?${new URLSearchParams({ code: GOOGLE_CODE, state })}`, { redirect: "manual" });
	expect((await send(owner, `${connectionsPath(siteId)}/google`, "PATCH", { property: GOOGLE_PROPERTY })).status).toBe(200);
}

async function connectBothEngines(siteId: string) {
	await connectGoogle(siteId);
	expect((await connectBing(owner, siteId)).status).toBe(200);
	expect((await send(owner, `${connectionsPath(siteId)}/bing`, "PATCH", { property: BING_SITE })).status).toBe(200);
	// The first Google run fetches four months, enough for every window below.
	const fourMonthsAgo = shiftDate(utcToday(), -120);
	await waitFor(() => owner.$fetch<SearchConnections>(connectionsPath(siteId)), ({ google, bing }) => google?.backfilledFrom === fourMonthsAgo && !!bing?.syncedAt);
}

function report(siteId: string, query = "range=7d") {
	return owner.$fetch<SearchReport>(`/api/sites/${siteId}/search?${query}`);
}

function googleClicks(dates: string[]) {
	return dates.reduce((sum, date) => sum + fakeGoogleDay(date).clicks, 0);
}

function bingDatesIn(dates: string[]) {
	const bingDates = new Set(fakeBingDates());
	return dates.filter(date => bingDates.has(date));
}

let owner: TestUser;
let organization: TestOrganization;
let site: Site;
let plainSite: Site;

beforeAll(async () => {
	owner = await signUp("everywhere-owner");
	organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization);
	plainSite = await createSiteAs(owner, organization);
	await connectBothEngines(site.id);
});

describe("connecting Bing Webmaster Tools", () => {
	it("checks the API key with Bing and keeps it encrypted", async () => {
		const other = await createSiteAs(owner, organization);
		const refused = await connectBing(owner, other.id, "not-a-key");
		expect(refused.status).toBe(400);
		expect((await refused.json() as { message: string }).message).toContain("Bing refused this API key");

		const response = await connectBing(owner, other.id);
		expect(response.status).toBe(200);
		expect(await response.json() as SearchConnection).toMatchObject({ engine: "bing", property: null });
		const stored = await testDb.execute({ sql: "SELECT credential FROM search_connections WHERE site_id = ?", args: [other.id] });
		expect(stored.rows[0]!.credential).not.toContain(BING_API_KEY);
	});

	it("lists only the verified Bing sites", async () => {
		const properties = await owner.$fetch<SearchProperty[]>(`${connectionsPath(site.id)}/bing/properties`);
		expect(properties.map(property => property.id)).toEqual([BING_SITE]);
	});

	it("lets only Owners and Admins connect, and only Bing with a key", async () => {
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await connectBing(viewer, plainSite.id)).status).toBe(403);
		expect((await send(owner, `${connectionsPath(plainSite.id)}/google`, "PUT", { apiKey: BING_API_KEY })).status).toBe(404);
	});
});

describe("the Search page across engines", () => {
	it("adds Bing's daily totals to Google's, and filters by engine", async () => {
		const latest = fakeGoogleLatest();
		const week = dateRangeList(shiftDate(latest, -6), latest);
		const all = await report(site.id);
		expect(all.engines).toEqual(["bing", "google"]);
		expect(all.summary.clicks).toBe(googleClicks(week) + 7 * fakeBingTraffic.clicks);

		const bing = await report(site.id, "range=7d&engine=bing");
		expect(bing.summary).toMatchObject({ clicks: 7 * fakeBingTraffic.clicks, impressions: 7 * fakeBingTraffic.impressions });
		expect(bing.summary.position).toBeCloseTo((3 * 15 + 6 * 10) / 25);
		expect((await report(site.id, "range=7d&engine=google")).summary.clicks).toBe(googleClicks(week));
	});

	it("charts one series per engine", async () => {
		const { points } = await report(site.id);
		expect(points.filter(point => point.engine === "google")).toHaveLength(7);
		expect(points.filter(point => point.engine === "bing").every(point => point.clicks === fakeBingTraffic.clicks)).toBe(true);
		expect((await report(site.id, "range=7d&engine=bing")).points.map(point => point.engine)).toEqual(Array(7).fill("bing"));
	});

	it("counts Bing's keywords and pages, which carry no country or device", async () => {
		const all = await report(site.id);
		expect(all.keywords.find(row => row.query === "analytics tool")).toMatchObject({ clicks: 28 + 7 });
		expect(all.keywords.find(row => row.query === "bing only keyword")).toMatchObject({ clicks: 7 });

		const bing = await report(site.id, "range=7d&engine=bing");
		expect(bing.pages).toEqual([{ value: BING_SITE, clicks: 14, impressions: 175, position: 4 }]);
		expect(bing.countries).toEqual([]);
		expect(bing.devices).toEqual([]);
	});
});

describe("the Pages table", () => {
	it("adds each page's search clicks, impressions, CTR and position over the Range's days", async () => {
		for (const path of ["/", "/pricing"]) {
			await collect({ site_id: site.id, path }, { ip: uniqueIp() });
		}
		const stats = await waitFor(() => owner.$fetch<PageStats>(`/api/sites/${site.id}/page-stats?range=7d`), current => current.rows.length === 2);
		const today = utcToday();
		const rangeDates = dateRangeList(shiftDate(today, -6), today).filter(date => date <= fakeGoogleLatest());
		const home = stats.rows.find(row => row.path === "/")!;
		// Google's rows for / earn 3 clicks a day, Bing's page rows 2.
		expect(home.search).toMatchObject({ clicks: rangeDates.length * 3 + bingDatesIn(rangeDates).length * 2 });
		expect(stats.rows.find(row => row.path === "/pricing")!.search).toMatchObject({ clicks: rangeDates.length });
		expect(stats.summary.searchClicks).toBe(googleClicks(rangeDates) + bingDatesIn(rangeDates).length * fakeBingTraffic.clicks);
	});

	it("leaves the search columns out for a Site without a Search connection", async () => {
		await collect({ site_id: plainSite.id, path: "/" }, { ip: uniqueIp() });
		const stats = await waitFor(() => owner.$fetch<PageStats>(`/api/sites/${plainSite.id}/page-stats?range=7d`), current => current.rows.length === 1);
		expect(stats.summary.searchClicks).toBeNull();
		expect(stats.rows[0]!.search).toBeNull();
	});
});

describe("All sites", () => {
	it("shows each Site's search clicks over the last 28 days of data, and their total", async () => {
		const latest = fakeGoogleLatest();
		const current = dateRangeList(shiftDate(latest, -27), latest);
		const previous = dateRangeList(shiftDate(latest, -55), shiftDate(latest, -28));
		const overview = await owner.$fetch<AllSitesOverview>(`/api/organizations/${organization.id}/overview`);
		const entry = overview.sites.find(candidate => candidate.site.id === site.id)!;
		expect(entry.searchClicks).toBe(googleClicks(current) + bingDatesIn(current).length * fakeBingTraffic.clicks);
		expect(entry.previous.searchClicks).toBe(googleClicks(previous) + bingDatesIn(previous).length * fakeBingTraffic.clicks);
		expect(overview.sites.find(candidate => candidate.site.id === plainSite.id)!.searchClicks).toBeNull();
		expect(overview.totals.searchClicks).toBe(entry.searchClicks);
	});
});

describe("Search insights", () => {
	it("gives a card per Site with its figures, trend and last sync", async () => {
		const insights = await owner.$fetch<SearchInsights>(`/api/organizations/${organization.id}/search-insights?range=28d`);
		const card = insights.sites.find(entry => entry.site.id === site.id)!;
		const shown = await report(site.id, "range=28d");
		expect(card).toMatchObject({ engines: ["bing", "google"], window: shown.window });
		expect(card.summary).toMatchObject({ clicks: shown.summary.clicks, impressions: shown.summary.impressions });
		expect(card.summary!.previous.clicks).toBe(shown.summary.previous.clicks);
		expect(card.trend).toHaveLength(28);
		expect(card.lastSyncedAt).toBeGreaterThan(0);
		expect(insights.sites.find(entry => entry.site.id === plainSite.id)).toMatchObject({ engines: [], summary: null, trend: [] });
	});

	it("is only for Members of the Organization", async () => {
		const stranger = await signUp("insights-stranger");
		expect((await stranger.fetch(`/api/organizations/${organization.id}/search-insights`)).status).toBe(404);
	});
});
