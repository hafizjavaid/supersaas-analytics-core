import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, collect, createOrganization, createSite, createSiteAs, fetch, postAs, signUp, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Hit } from "./helpers";
import type { Funnel, FunnelResults, Site } from "#layers/core/shared/types/analytics";

await setupServer();

const DAY = 86_400;

const pricingFunnel = {
	name: "Pricing to signup",
	window: "1h",
	steps: [
		{ kind: "page", value: "/" },
		{ kind: "page", value: "/pricing*", label: "Pricing" },
		{ kind: "event", value: "signup" },
	],
};

function sendFunnel(siteId: string, body: unknown, method = "POST", path = "") {
	return fetch(`/api/sites/${siteId}/funnels${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function createFunnel(siteId: string, body: unknown = pricingFunnel) {
	const response = await sendFunnel(siteId, body);
	expect(response.status).toBe(201);
	return await response.json() as Funnel;
}

function withFilters(query: string, filters: string[]) {
	return [query, ...filters.map(filter => `f=${encodeURIComponent(filter)}`)].join("&");
}

function results(siteId: string, funnelId: string, query = "range=today", filters: string[] = []) {
	return $fetch<FunnelResults>(`/api/sites/${siteId}/funnels/${funnelId}/report?${withFilters(query, filters)}`);
}

function stepCounts(report: FunnelResults) {
	return report.steps.map(step => step.visitors);
}

async function visitorIdOf(response: Promise<Response>) {
	return (await response).headers.get("sd-visitor")!;
}

describe("managing Funnels", () => {
	it("creates, lists, updates and deletes a Funnel", async () => {
		const site = await createSite();
		const funnel = await createFunnel(site.id);
		expect(funnel).toMatchObject({
			name: "Pricing to signup",
			window: "1h",
			steps: [{ kind: "page", value: "/", label: "" }, { kind: "page", value: "/pricing*", label: "Pricing" }, { kind: "event", value: "signup", label: "" }],
		});
		expect(await $fetch<Funnel[]>(`/api/sites/${site.id}/funnels`)).toEqual([funnel]);

		const updated = await sendFunnel(site.id, { ...pricingFunnel, name: "Renamed", window: "7d" }, "PATCH", `/${funnel.id}`);
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({ id: funnel.id, name: "Renamed", window: "7d" });

		expect((await fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, { method: "DELETE" })).status).toBe(404);
		expect((await sendFunnel(site.id, pricingFunnel, "PATCH", `/${funnel.id}`)).status).toBe(404);
		expect((await fetch(`/api/sites/${site.id}/funnels/${funnel.id}/report`)).status).toBe(404);
		expect(await $fetch<Funnel[]>(`/api/sites/${site.id}/funnels`)).toEqual([]);
	});

	it("rejects an invalid Funnel", async () => {
		const site = await createSite();
		const step = { kind: "page", value: "/" };
		expect((await sendFunnel(site.id, { name: "One step", steps: [step] })).status).toBe(400);
		expect((await sendFunnel(site.id, { name: "Nine steps", steps: Array.from({ length: 9 }, () => step) })).status).toBe(400);
		expect((await sendFunnel(site.id, { name: "Bad page", steps: [step, { kind: "page", value: "pricing" }] })).status).toBe(400);
		expect((await sendFunnel(site.id, { name: "Bad window", window: "2h", steps: [step, step] })).status).toBe(400);
		expect((await sendFunnel(site.id, { name: "", steps: [step, step] })).status).toBe(400);
	});

	it("lets Viewers read Funnels but not change them", async () => {
		const owner = await signUp("owner");
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		const admin = await addMember(owner, organization.id, "admin");

		const created = await postAs(admin, `/api/sites/${site.id}/funnels`, pricingFunnel);
		expect(created.status).toBe(201);
		const funnel = await created.json() as Funnel;

		const patch = { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(pricingFunnel) };
		expect((await postAs(viewer, `/api/sites/${site.id}/funnels`, pricingFunnel)).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, patch)).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, { method: "DELETE" })).status).toBe(403);
		expect(await viewer.$fetch<Funnel[]>(`/api/sites/${site.id}/funnels`)).toEqual([funnel]);
		expect((await viewer.fetch(`/api/sites/${site.id}/funnels/${funnel.id}/report`)).status).toBe(200);
		expect((await postAs(viewer, `/api/sites/${site.id}/funnel-preview`, pricingFunnel)).status).toBe(200);
		expect((await admin.fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, patch)).status).toBe(200);

		const stranger = await signUp("stranger");
		await createOrganization(stranger);
		expect((await stranger.fetch(`/api/sites/${site.id}/funnels`)).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/funnels/${funnel.id}/report`)).status).toBe(404);
		expect((await postAs(stranger, `/api/sites/${site.id}/funnel-preview`, pricingFunnel)).status).toBe(404);
		expect((await postAs(stranger, `/api/sites/${site.id}/funnels`, pricingFunnel)).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, { method: "DELETE" })).status).toBe(404);
	});

	it("keeps another Site's Funnel out of reach", async () => {
		const site = await createSite();
		const other = await createSite();
		const funnel = await createFunnel(other.id);
		expect((await fetch(`/api/sites/${site.id}/funnels/${funnel.id}/report`)).status).toBe(404);
		expect((await fetch(`/api/sites/${site.id}/funnels/${funnel.id}`, { method: "DELETE" })).status).toBe(404);
	});

	it("deletes a Site's Funnels with the Site", async () => {
		const site = await createSite();
		await createFunnel(site.id);
		expect((await fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(204);
		const rows = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM funnels WHERE site_id = ?", args: [site.id] });
		expect(Number(rows.rows[0]!.count)).toBe(0);
	});
});

let site: Site;
let hourFunnel: Funnel;
let dayFunnel: Funnel;

// Steps: / -> /pricing* -> signup.
// alice: / -> /blog -> /pricing/team -> signup             all three, with extra pages in between
// bob:   / -> /pricing                                    two
// carol: /pricing -> / -> signup                          one: /pricing came before /
// dave:  /                                                one
// erin:  /about                                           never entered
// frank: / (90 minutes earlier) -> /pricing -> signup     one within 1 hour, all three within 24 hours
async function arrangeSite() {
	site = await createSite({ timezone: timezoneAwayFromMidnight() });
	const people = Object.fromEntries(["alice", "bob", "carol", "dave", "erin", "frank"].map(name => [name, { ip: uniqueIp() } satisfies Hit]));
	let pageviews = 0;
	const view = async (who: Hit, path: string) => {
		const response = collect({ site_id: site.id, path }, who);
		pageviews += 1;
		await waitForPageviews(site.id, pageviews);
		return response;
	};
	const signup = (who: Hit) => collect({ site_id: site.id, name: "signup", path: "/pricing" }, who);

	await view(people.alice!, "/");
	await view(people.alice!, "/blog");
	await view(people.alice!, "/pricing/team");
	await signup(people.alice!);
	await view(people.bob!, "/");
	await view(people.bob!, "/pricing");
	await view(people.carol!, "/pricing");
	await view(people.carol!, "/");
	await signup(people.carol!);
	await view(people.dave!, "/");
	await view(people.erin!, "/about");
	const frankId = await visitorIdOf(view(people.frank!, "/"));
	await view(people.frank!, "/pricing");
	await signup(people.frank!);

	hourFunnel = await createFunnel(site.id);
	dayFunnel = await createFunnel(site.id, { ...pricingFunnel, name: "Within a day", window: "24h" });
	await waitFor(() => results(site.id, hourFunnel.id), report => report.steps[2]!.visitors === 2);

	const ninetyMinutes = 90 * 60;
	await testDb.batch([
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE path = '/' AND visit_id IN (SELECT id FROM visits WHERE visitor_id = ?)", args: [ninetyMinutes, frankId] },
		{ sql: "UPDATE visits SET started_at = started_at - ? WHERE visitor_id = ?", args: [ninetyMinutes, frankId] },
	]);
}

let identifiedSite: Site;
let weekFunnel: Funnel;

// The same person on two days is two Visitors (ADR 0002); identify() makes them one person in a Funnel.
async function arrangeIdentifiedSite() {
	identifiedSite = await createSite({ timezone: timezoneAwayFromMidnight() });
	const [yesterday, today, anonymousYesterday, anonymousToday] = [{ ip: uniqueIp() }, { ip: uniqueIp() }, { ip: uniqueIp() }, { ip: uniqueIp() }];
	const yesterdayId = await visitorIdOf(collect({ site_id: identifiedSite.id, path: "/" }, yesterday));
	const anonymousYesterdayId = await visitorIdOf(collect({ site_id: identifiedSite.id, path: "/" }, anonymousYesterday));
	await waitForPageviews(identifiedSite.id, 2);
	await collect({ site_id: identifiedSite.id, path: "/pricing" }, today);
	await collect({ site_id: identifiedSite.id, path: "/pricing" }, anonymousToday);
	await waitForPageviews(identifiedSite.id, 4);
	await collect({ site_id: identifiedSite.id, identify: "user-42" }, yesterday);
	await collect({ site_id: identifiedSite.id, identify: "user-42" }, today);
	weekFunnel = await createFunnel(identifiedSite.id, { name: "Across days", window: "7d", steps: [{ kind: "page", value: "/" }, { kind: "page", value: "/pricing" }] });
	await waitFor(() => results(identifiedSite.id, weekFunnel.id, "range=7d"), report => report.completed === 1);

	for (const visitorId of [yesterdayId, anonymousYesterdayId]) {
		await testDb.batch([
			{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE visit_id IN (SELECT id FROM visits WHERE visitor_id = ?)", args: [DAY, visitorId] },
			{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE visitor_id = ?", args: [DAY, DAY, visitorId] },
		]);
	}
}

beforeAll(async () => {
	await arrangeSite();
	await arrangeIdentifiedSite();
});

describe("Funnel results", () => {
	it("counts a step only after every earlier step, allowing other pages in between", async () => {
		const report = await results(site.id, hourFunnel.id);
		expect(report).toMatchObject({ visitors: 6, entered: 5, completed: 1, conversionRate: 0.2 });
		expect(report.enteredRate).toBeCloseTo(5 / 6);
		expect(stepCounts(report)).toEqual([5, 2, 1]);
	});

	it("describes each step with its share of entries, continue rate and drop", async () => {
		const report = await results(site.id, hourFunnel.id);
		expect(report.steps.map(step => [step.label, step.entryRate, step.continueRate, step.dropped])).toEqual([
			["/", 1, null, 0],
			["Pricing", 0.4, 0.4, 3],
			["signup", 0.2, 0.5, 1],
		]);
	});

	it("leaves out steps completed after the window", async () => {
		expect(stepCounts(await results(site.id, dayFunnel.id))).toEqual([5, 3, 2]);
	});

	it("lets the Filters choose the Visits a person enters in", async () => {
		const report = await results(site.id, hourFunnel.id, "range=today", ["page:/blog"]);
		expect(report).toMatchObject({ visitors: 1, entered: 1, completed: 1 });
		expect(stepCounts(await results(site.id, hourFunnel.id, "range=today", ["page:/about"]))).toEqual([0, 0, 0]);
	});

	it("previews an unsaved Funnel over the Range", async () => {
		const response = await fetch(`/api/sites/${site.id}/funnel-preview?range=today`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Draft", window: "24h", steps: [{ kind: "page", value: "/pricing" }, { kind: "event", value: "signup" }] }),
		});
		expect(response.status).toBe(200);
		const report = await response.json() as FunnelResults;
		expect(report.range.fromDate).toBe(report.range.today);
		expect(stepCounts(report)).toEqual([3, 2]);

		const invalid = await fetch(`/api/sites/${site.id}/funnel-preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Draft", steps: [] }) });
		expect(invalid.status).toBe(400);
	});

	it("answers zeros for a Site without traffic", async () => {
		const empty = await createSite();
		const funnel = await createFunnel(empty.id);
		const report = await results(empty.id, funnel.id);
		expect(report).toMatchObject({ visitors: 0, entered: 0, completed: 0, conversionRate: 0, enteredRate: 0 });
		expect(stepCounts(report)).toEqual([0, 0, 0]);
	});
});

describe("Identified visitors in Funnels", () => {
	it("follows an Identified visitor across days, but not two anonymous Visitors", async () => {
		const report = await results(identifiedSite.id, weekFunnel.id, "range=7d");
		expect(report).toMatchObject({ visitors: 3, entered: 2, completed: 1 });
	});

	it("reads past days from raw rows and keeps today's later steps of yesterday's entry", async () => {
		const yesterday = await results(identifiedSite.id, weekFunnel.id, "range=yesterday");
		expect(yesterday).toMatchObject({ visitors: 2, entered: 2, completed: 1 });
		expect((await results(identifiedSite.id, weekFunnel.id, "range=today")).entered).toBe(0);
	});
});
