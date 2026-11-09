import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, collect, createOrganization, createSite, createSiteAs, fetch, postAs, signUp, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Goal, GoalReport, Site, SummaryWithPrevious, TimeseriesPoint } from "#layers/core/shared/types/analytics";

await setupServer();

const DAY = 86_400;

function withFilters(query: string, filters: string[]) {
	return [query, ...filters.map(filter => `f=${encodeURIComponent(filter)}`)].join("&");
}

function report(siteId: string, query = "range=today", filters: string[] = []) {
	return $fetch<GoalReport>(`/api/sites/${siteId}/goal-conversions?${withFilters(query, filters)}`);
}

function summary(siteId: string, query = "range=today", filters: string[] = []) {
	return $fetch<SummaryWithPrevious>(`/api/sites/${siteId}/summary?${withFilters(query, filters)}`);
}

function addGoal(siteId: string, body: Record<string, unknown>) {
	return fetch(`/api/sites/${siteId}/goals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function createGoal(siteId: string, body: Record<string, unknown>) {
	const response = await addGoal(siteId, body);
	expect(response.status).toBe(201);
	return await response.json() as Goal;
}

function rowsByName(goalReport: GoalReport) {
	return Object.fromEntries(goalReport.goals.map(row => [row.goal.name, { conversions: row.conversions, visitors: row.visitors, conversionRate: row.conversionRate }]));
}

async function moveRawRowsBack(siteId: string, days: number) {
	const seconds = days * DAY;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [seconds, seconds, siteId] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
		{ sql: "UPDATE events SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
		{ sql: "UPDATE outbound_links SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
	]);
}

describe("managing Goals", () => {
	it("adds a Goal with a default name, lists it and deletes it", async () => {
		const site = await createSite();
		const goal = await createGoal(site.id, { kind: "page", value: "/blog/*" });
		expect(goal).toMatchObject({ kind: "page", value: "/blog/*", name: "Visited /blog/*" });
		const named = await createGoal(site.id, { kind: "event", value: "WhatsApp click", name: "WhatsApp leads" });

		expect(await $fetch<Goal[]>(`/api/sites/${site.id}/goals`)).toEqual([goal, named]);

		expect((await fetch(`/api/sites/${site.id}/goals/${goal.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await fetch(`/api/sites/${site.id}/goals/${goal.id}`, { method: "DELETE" })).status).toBe(404);
		expect(await $fetch<Goal[]>(`/api/sites/${site.id}/goals`)).toEqual([named]);
	});

	it("rejects a duplicate Goal and an invalid one", async () => {
		const site = await createSite();
		await createGoal(site.id, { kind: "outbound" });
		expect((await addGoal(site.id, { kind: "outbound", name: "Again" })).status).toBe(409);
		expect((await addGoal(site.id, { kind: "page", value: "pricing" })).status).toBe(400);
		expect((await addGoal(site.id, { kind: "event", value: "" })).status).toBe(400);
		expect((await addGoal(site.id, { kind: "signup" })).status).toBe(400);
	});

	it("lets Viewers read Goals but not change them", async () => {
		const owner = await signUp("owner");
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		const admin = await addMember(owner, organization.id, "admin");

		const created = await postAs(admin, `/api/sites/${site.id}/goals`, { kind: "event", value: "signup" });
		expect(created.status).toBe(201);
		const goal = await created.json() as Goal;

		expect((await postAs(viewer, `/api/sites/${site.id}/goals`, { kind: "event", value: "other" })).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}/goals/${goal.id}`, { method: "DELETE" })).status).toBe(403);
		expect(await viewer.$fetch<Goal[]>(`/api/sites/${site.id}/goals`)).toEqual([goal]);
		expect((await viewer.fetch(`/api/sites/${site.id}/goal-conversions`)).status).toBe(200);

		const stranger = await signUp("stranger");
		await createOrganization(stranger);
		expect((await stranger.fetch(`/api/sites/${site.id}/goals`)).status).toBe(404);
		expect((await postAs(stranger, `/api/sites/${site.id}/goals`, { kind: "event", value: "x" })).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/goals/${goal.id}`, { method: "DELETE" })).status).toBe(404);
	});

	it("deletes a Site's Goals with the Site", async () => {
		const site = await createSite();
		await createGoal(site.id, { kind: "event", value: "signup" });
		expect((await fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(204);
		const rows = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM goals WHERE site_id = ?", args: [site.id] });
		expect(Number(rows.rows[0]!.count)).toBe(0);
	});
});

let site: Site;
let pastSite: Site;

// alice: / then /blog/one, signup twice, one Outbound link
// bob:   /blog/two, Phone click
// carol: /pricing
// dave:  /
async function arrangeSite() {
	site = await createSite({ timezone: timezoneAwayFromMidnight() });
	const [alice, bob, carol, dave] = [{ ip: uniqueIp() }, { ip: uniqueIp() }, { ip: uniqueIp() }, { ip: uniqueIp() }];

	await collect({ site_id: site.id, path: "/" }, alice);
	await collect({ site_id: site.id, path: "/blog/two" }, bob);
	await collect({ site_id: site.id, path: "/pricing" }, carol);
	await collect({ site_id: site.id, path: "/" }, dave);
	await waitForPageviews(site.id, 4);

	await collect({ site_id: site.id, path: "/blog/one" }, alice);
	await collect({ site_id: site.id, name: "signup", path: "/blog/one" }, alice);
	await collect({ site_id: site.id, name: "signup", path: "/blog/one" }, alice);
	await collect({ site_id: site.id, outbound_url: "https://example.org/" }, alice);
	await collect({ site_id: site.id, name: "Phone click", path: "/blog/two" }, bob);
	await waitForPageviews(site.id, 5);

	await createGoal(site.id, { kind: "event", value: "signup", name: "Signups" });
	await createGoal(site.id, { kind: "page", value: "/blog/*", name: "Blog" });
	await createGoal(site.id, { kind: "outbound", name: "Outbound" });
	await createGoal(site.id, { kind: "event", value: "Phone click", name: "Phone" });
	await createGoal(site.id, { kind: "page", value: "/pricing", name: "Pricing" });
	await waitFor(() => report(site.id), goalReport => goalReport.goals.reduce((sum, row) => sum + row.conversions, 0) === 7);
}

// Yesterday: one of two Visitors signs up. Today: one of three.
async function arrangePastSite() {
	pastSite = await createSite({ timezone: timezoneAwayFromMidnight() });
	await createGoal(pastSite.id, { kind: "event", value: "signup" });

	const [yesterdayBuyer, yesterdayBrowser] = [{ ip: uniqueIp() }, { ip: uniqueIp() }];
	await collect({ site_id: pastSite.id, path: "/" }, yesterdayBuyer);
	await collect({ site_id: pastSite.id, path: "/" }, yesterdayBrowser);
	await waitForPageviews(pastSite.id, 2);
	await collect({ site_id: pastSite.id, name: "signup", path: "/" }, yesterdayBuyer);
	await waitFor(() => report(pastSite.id), goalReport => goalReport.converted === 1);
	await moveRawRowsBack(pastSite.id, 1);

	const [buyer, browser, another] = [{ ip: uniqueIp() }, { ip: uniqueIp() }, { ip: uniqueIp() }];
	await collect({ site_id: pastSite.id, path: "/" }, buyer);
	await collect({ site_id: pastSite.id, path: "/" }, browser);
	await collect({ site_id: pastSite.id, path: "/" }, another);
	await waitForPageviews(pastSite.id, 3);
	await collect({ site_id: pastSite.id, name: "signup", path: "/" }, buyer);
	await waitFor(() => report(pastSite.id), goalReport => goalReport.converted === 1);
}

beforeAll(async () => {
	await arrangePastSite();
	await arrangeSite();
});

describe("conversion rates", () => {
	it("counts each Goal's conversions, unique Visitors and conversion rate", async () => {
		const goalReport = await report(site.id);
		expect(rowsByName(goalReport)).toEqual({
			Signups: { conversions: 2, visitors: 1, conversionRate: 0.25 },
			Blog: { conversions: 2, visitors: 2, conversionRate: 0.5 },
			Outbound: { conversions: 1, visitors: 1, conversionRate: 0.25 },
			Phone: { conversions: 1, visitors: 1, conversionRate: 0.25 },
			Pricing: { conversions: 1, visitors: 1, conversionRate: 0.25 },
		});
		expect(goalReport.goals[0]!.goal.name).toBe("Blog");
		expect(goalReport).toMatchObject({ visitors: 4, converted: 3, conversionRate: 0.75 });
	});

	it("reports the share of Visitors who completed any Goal as the Conversion rate KPI", async () => {
		expect((await summary(site.id)).conversionRate).toBe(0.75);
	});

	it("narrows the dashboard to the Visits that converted when a Goal is selected", async () => {
		const blog = await summary(site.id, "range=today", ["goal:page:/blog/*"]);
		expect(blog).toMatchObject({ visitors: 2, pageviews: 3, conversionRate: 0.5 });

		const outbound = await summary(site.id, "range=today", ["goal:outbound"]);
		expect(outbound).toMatchObject({ visitors: 1, pageviews: 2, conversionRate: 0.25 });

		const pages = await $fetch<{ rows: { path: string }[] }>(`/api/sites/${site.id}/pages?${withFilters("range=today", ["goal:event:Phone click"])}`);
		expect(pages.rows.map(row => row.path)).toEqual(["/blog/two"]);
	});

	it("keeps listing every Goal against the other Filters when one is selected", async () => {
		const goalReport = await report(site.id, "range=today", ["goal:event:signup"]);
		expect(goalReport).toMatchObject({ visitors: 4, converted: 3 });
		expect(rowsByName(goalReport).Blog).toEqual({ conversions: 2, visitors: 2, conversionRate: 0.5 });
	});

	it("computes rates within other Filters", async () => {
		const filtered = await report(site.id, "range=today", ["page:/blog/one"]);
		expect(filtered).toMatchObject({ visitors: 1, converted: 1, conversionRate: 1 });
		expect(rowsByName(filtered)).toMatchObject({
			Signups: { conversions: 2, visitors: 1, conversionRate: 1 },
			Pricing: { conversions: 0, visitors: 0, conversionRate: 0 },
		});
		expect((await summary(site.id, "range=today", ["page:/blog/one"])).conversionRate).toBe(1);
	});

	it("adds a conversion rate to each chart point", async () => {
		const { points } = await $fetch<{ points: TimeseriesPoint[] }>(`/api/sites/${site.id}/timeseries?range=7d`);
		expect(points).toHaveLength(7);
		expect(points.at(-1)!.conversionRate).toBe(0.75);
		expect(points.slice(0, -1).every(point => point.conversionRate === 0)).toBe(true);
	});
});

describe("conversion rates over past days", () => {
	it("compares today's Conversion rate with the previous period", async () => {
		const today = await summary(pastSite.id);
		expect(today.conversionRate).toBeCloseTo(1 / 3);
		expect(today.previous.conversionRate).toBe(0.5);
	});

	it("reads past days from raw rows", async () => {
		expect(await report(pastSite.id, "range=7d")).toMatchObject({ visitors: 5, converted: 2, conversionRate: 0.4 });
		expect((await summary(pastSite.id, "range=yesterday")).conversionRate).toBe(0.5);
	});
});

describe("a Site without Goals", () => {
	it("has no Conversion rate", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 1);

		const today = await summary(site.id);
		expect(today.conversionRate).toBeNull();
		expect(today.previous.conversionRate).toBeNull();
		const { points } = await $fetch<{ points: TimeseriesPoint[] }>(`/api/sites/${site.id}/timeseries?range=7d`);
		expect(points.every(point => point.conversionRate === undefined)).toBe(true);
		expect(await report(site.id)).toEqual(expect.objectContaining({ visitors: 0, converted: 0, conversionRate: 0, goals: [] }));
	});
});
