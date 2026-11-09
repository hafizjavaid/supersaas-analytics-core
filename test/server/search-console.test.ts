import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, createOrganization, createSiteAs, overrideDeployment, signUp, testDb, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { fakeGoogleDay, fakeGoogleLatest, FAKE_GOOGLE_OAUTH_URL, GOOGLE_CODE, GOOGLE_EMPTY_PROPERTY, GOOGLE_PROPERTY, GOOGLE_REFRESH_TOKEN, GOOGLE_REVOKED_CODE, GOOGLE_UNVERIFIED_PROPERTY, TEST_GOOGLE_CLIENT_ID, utcToday } from "./search";
import type { Site } from "#layers/core/shared/types/analytics";
import type { SearchBreakdowns, SearchConnections, SearchProperty, SearchReport } from "#layers/core/shared/types/search";
import { dateRangeList, shiftDate } from "#layers/core/shared/utils/dates";
import { BACKFILL_DAYS } from "#layers/core/shared/utils/search";

await setupServer();

function connectionsPath(siteId: string) {
	return `/api/sites/${siteId}/search-connections`;
}

function authorize(user: TestUser, siteId: string) {
	return user.fetch(`${connectionsPath(siteId)}/google/authorize`, { redirect: "manual" });
}

async function stateFor(user: TestUser, siteId: string) {
	const response = await authorize(user, siteId);
	return new URL(response.headers.get("location")!).searchParams.get("state")!;
}

function callback(user: TestUser, query: Record<string, string>) {
	return user.fetch(`/api/search-connections/google/callback?${new URLSearchParams(query)}`, { redirect: "manual" });
}

async function connectGoogle(user: TestUser, siteId: string, code = GOOGLE_CODE) {
	return callback(user, { code, state: await stateFor(user, siteId) });
}

function chooseProperty(user: TestUser, siteId: string, property: string) {
	return user.fetch(`${connectionsPath(siteId)}/google`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ property }),
	});
}

function connections(siteId: string) {
	return owner.$fetch<SearchConnections>(connectionsPath(siteId));
}

function report(siteId: string, query = "range=7d") {
	return owner.$fetch<SearchReport>(`/api/sites/${siteId}/search?${query}`);
}

function runSync() {
	return owner.$fetch("/_nitro/tasks/search:sync", { method: "POST", body: { payload: {} } });
}

function totalOf(dates: string[]) {
	return dates.reduce((sum, date) => {
		const day = fakeGoogleDay(date);
		return { clicks: sum.clicks + day.clicks, impressions: sum.impressions + day.impressions };
	}, { clicks: 0, impressions: 0 });
}

async function syncedSite() {
	const created = await createSiteAs(owner, organization);
	await connectGoogle(owner, created.id);
	expect((await chooseProperty(owner, created.id, GOOGLE_PROPERTY)).status).toBe(200);
	await waitFor(() => report(created.id), current => current.window !== null);
	return created;
}

let owner: TestUser;
let organization: TestOrganization;

beforeAll(async () => {
	owner = await signUp("search-owner");
	organization = await createOrganization(owner);
});

describe("connecting Google Search Console", () => {
	let site: Site;

	beforeAll(async () => {
		site = await createSiteAs(owner, organization);
	});

	it("sends an Owner to Google's consent screen for read-only Search Console access", async () => {
		const response = await authorize(owner, site.id);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location")!);
		expect(`${location.origin}${location.pathname}`).toBe(FAKE_GOOGLE_OAUTH_URL);
		expect(Object.fromEntries(location.searchParams)).toMatchObject({
			client_id: TEST_GOOGLE_CLIENT_ID,
			scope: "https://www.googleapis.com/auth/webmasters.readonly",
			access_type: "offline",
			prompt: "consent",
			response_type: "code",
		});
		expect(location.searchParams.get("redirect_uri")).toMatch(/\/api\/search-connections\/google\/callback$/);
	});

	it("lets only Owners and Admins of the Site's Organization connect", async () => {
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await authorize(viewer, site.id)).status).toBe(403);
		const stranger = await signUp("search-stranger");
		expect((await authorize(stranger, site.id)).status).toBe(404);
		expect((await stranger.fetch(connectionsPath(site.id))).status).toBe(404);
	});

	it("hides Google and answers 404 to connecting while the server has no Google OAuth client", async () => {
		await overrideDeployment({ googleSearchConsole: false });
		try {
			expect((await authorize(owner, site.id)).status).toBe(404);
			expect((await connections(site.id)).googleAvailable).toBe(false);
		}
		finally {
			await overrideDeployment({});
		}
	});

	it("keeps the refresh token encrypted and never returns it", async () => {
		const response = await connectGoogle(owner, site.id);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(`/app/${organization.slug}/sites/${site.id}/settings/integrations?searchConnected=google`);

		const listed = await connections(site.id);
		expect(listed.google).toMatchObject({ engine: "google", property: null, syncedAt: null });
		expect(listed.googleAvailable).toBe(true);
		expect(JSON.stringify(listed)).not.toContain(GOOGLE_REFRESH_TOKEN);

		const stored = await testDb.execute({ sql: "SELECT credential FROM search_connections WHERE site_id = ?", args: [site.id] });
		expect(stored.rows[0]!.credential).not.toContain("google-refresh-token");
	});

	it("refuses a state that was tampered with or started by someone else", async () => {
		const admin = await addMember(owner, organization.id, "admin");
		const state = await stateFor(owner, site.id);
		expect((await callback(admin, { code: GOOGLE_CODE, state })).status).toBe(400);
		expect((await callback(owner, { code: GOOGLE_CODE, state: `${state}0` })).status).toBe(400);
	});

	it("returns to the settings with an error when Google refuses or the person declines", async () => {
		const refused = await connectGoogle(owner, site.id, "not-a-code");
		expect(refused.headers.get("location")).toMatch(/\?searchError=google$/);
		const declined = await callback(owner, { error: "access_denied", state: await stateFor(owner, site.id) });
		expect(declined.headers.get("location")).toMatch(/\?searchError=denied$/);
	});

	it("lists the verified properties of the Google account", async () => {
		const properties = await owner.$fetch<SearchProperty[]>(`${connectionsPath(site.id)}/google/properties`);
		expect(properties.map(property => property.id)).toEqual([GOOGLE_PROPERTY, GOOGLE_EMPTY_PROPERTY]);
	});

	it("refuses a property the account cannot read", async () => {
		expect((await chooseProperty(owner, site.id, GOOGLE_UNVERIFIED_PROPERTY)).status).toBe(400);
	});

	it("asks to connect again once Google has revoked access", async () => {
		const revoked = await createSiteAs(owner, organization);
		await connectGoogle(owner, revoked.id, GOOGLE_REVOKED_CODE);
		const response = await chooseProperty(owner, revoked.id, GOOGLE_PROPERTY);
		expect(response.status).toBe(400);
		expect((await response.json() as { message: string }).message).toContain("Connect Search Console again");
	});

	it("answers 404 for an engine the Site has not connected", async () => {
		const other = await createSiteAs(owner, organization);
		expect((await chooseProperty(owner, other.id, GOOGLE_PROPERTY)).status).toBe(404);
	});
});

let reportSite: Promise<Site> | undefined;

function arrangeReportSite() {
	reportSite ??= syncedSite();
	return reportSite;
}

describe("the Search report", () => {
	it("totals clicks and impressions from Google's daily figures, ending at its latest day", async () => {
		const site = await arrangeReportSite();
		const shown = await report(site.id);
		const latest = fakeGoogleLatest();
		expect(shown.engines).toEqual(["google"]);
		expect(shown.window).toEqual({ from: shiftDate(latest, -6), to: latest, previousFrom: shiftDate(latest, -13), previousTo: shiftDate(latest, -7) });
		const current = totalOf(dateRangeList(shiftDate(latest, -6), latest));
		const previous = totalOf(dateRangeList(shiftDate(latest, -13), shiftDate(latest, -7)));
		expect(shown.summary).toMatchObject({ clicks: current.clicks, impressions: current.impressions, position: 5 });
		expect(shown.summary.previous).toMatchObject({ clicks: previous.clicks, impressions: previous.impressions });
		expect(shown.points).toHaveLength(7);
		expect(shown.points[0]).toEqual({ date: shiftDate(latest, -6), engine: "google", ...totalOf([shiftDate(latest, -6)]) });
	});

	it("sorts keywords into buckets against the period before", async () => {
		const site = await arrangeReportSite();
		const { buckets } = await report(site.id);
		expect(buckets.new.map(row => row.query)).toEqual(["fresh keyword"]);
		expect(buckets.lost.map(row => row.query)).toEqual(["old keyword"]);
		expect(buckets.quickWins.map(row => row.query)).toContain("cookieless analytics");
		expect(buckets.opportunities.map(row => row.query)).toEqual(["privacy analytics"]);
	});

	it("lists keywords by clicks, and searches them", async () => {
		const site = await arrangeReportSite();
		const shown = await report(site.id);
		expect(shown.keywords.map(row => row.query)).toEqual(["analytics tool", "fresh keyword", "privacy analytics", "cookieless analytics"]);
		expect(shown.keywords[0]).toMatchObject({ clicks: 28, impressions: 420 });
		expect(shown.keywords[0]!.position).toBeCloseTo((2 * 40 + 3 * 20) / 60);
		const searched = await report(site.id, "range=7d&q=privacy");
		expect(searched.keywords.map(row => row.query)).toEqual(["privacy analytics"]);
		expect(searched.keywordTotal).toBe(1);
	});

	it("breaks traffic down by page, country and device, with two-letter country codes", async () => {
		const site = await arrangeReportSite();
		const shown = await report(site.id);
		expect(shown.pages[0]).toMatchObject({ value: "https://example.com/", clicks: 21 });
		expect(shown.countries.map(row => row.value)).toEqual(["US", "FR", "GB", "DE"]);
		expect(shown.devices.map(row => row.value)).toEqual(["desktop", "tablet", "mobile"]);
	});

	it("expands a keyword into its pages, countries and devices", async () => {
		const site = await arrangeReportSite();
		const detail = await owner.$fetch<SearchBreakdowns>(`/api/sites/${site.id}/search/keyword?range=7d&query=${encodeURIComponent("analytics tool")}`);
		expect(detail.pages.map(row => row.value)).toEqual(["https://example.com/", "https://example.com/pricing"]);
		expect(detail.countries.map(row => row.value)).toEqual(["US", "GB"]);
		expect(detail.devices.map(row => row.value)).toEqual(["desktop", "mobile"]);
	});

	it("is readable by Viewers but not by people outside the Organization", async () => {
		const site = await arrangeReportSite();
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await viewer.fetch(`/api/sites/${site.id}/search?range=7d`)).status).toBe(200);
		expect((await viewer.fetch(connectionsPath(site.id))).status).toBe(403);
		const stranger = await signUp("search-report-stranger");
		expect((await stranger.fetch(`/api/sites/${site.id}/search?range=7d`)).status).toBe(404);
	});

	it("is empty for a Site without a search connection", async () => {
		const other = await createSiteAs(owner, organization);
		expect(await report(other.id)).toMatchObject({ engines: [], window: null, keywords: [] });
	});
});

describe("syncing", () => {
	it("backfills 16 months over the hourly runs", async () => {
		const site = await syncedSite();
		const today = utcToday();
		// The first run, started by picking the property, fetches four months.
		await waitFor(() => connections(site.id), listed => listed.google?.backfilledFrom === shiftDate(today, -120));
		let listed = await connections(site.id);
		for (let run = 0; run < 6 && listed.google?.backfilledFrom !== shiftDate(today, -BACKFILL_DAYS); run += 1) {
			await runSync();
			listed = await connections(site.id);
		}
		expect(listed.google).toMatchObject({ backfilledFrom: shiftDate(today, -BACKFILL_DAYS), syncedThrough: shiftDate(today, -1), lastError: null });
		expect(listed.google!.syncedAt).toBeGreaterThan(0);
		expect((await report(site.id, "range=12m")).summary.previous.clicks).toBeGreaterThan(0);
	});

	it("drops the old property's data when another is picked", async () => {
		const site = await syncedSite();
		expect((await chooseProperty(owner, site.id, GOOGLE_EMPTY_PROPERTY)).status).toBe(200);
		await waitFor(() => connections(site.id), listed => listed.google?.syncedAt !== null);
		expect((await report(site.id)).window).toBeNull();
	});

	it("removes the connection and its data on disconnect", async () => {
		const site = await syncedSite();
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await viewer.fetch(`${connectionsPath(site.id)}/google`, { method: "DELETE" })).status).toBe(403);
		expect((await owner.fetch(`${connectionsPath(site.id)}/google`, { method: "DELETE" })).status).toBe(200);
		expect((await connections(site.id)).google).toBeNull();
		expect(await report(site.id)).toMatchObject({ engines: [], window: null });
	});
});
