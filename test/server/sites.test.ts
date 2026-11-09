import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, collect, createOrganization, createSite, createSiteAs, fetch, postAs, signedIn, signedInOrganization, signUp, sitesPath, testDb, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { TestUser } from "./helpers";
import type { Site, Summary } from "#layers/core/shared/types/analytics";

await setupServer();

async function postSite(body: unknown) {
	return postAs(await signedIn(), sitesPath(await signedInOrganization()), body);
}

function patchAs(user: Pick<TestUser, "fetch">, siteId: string, body: unknown) {
	return user.fetch(`/api/sites/${siteId}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function organizationWithRoles() {
	const owner = await signUp("owner");
	const organization = await createOrganization(owner);
	const site = await createSiteAs(owner, organization);
	const admin = await addMember(owner, organization.id, "admin");
	const viewer = await addMember(owner, organization.id, "viewer");
	return { owner, organization, site, admin, viewer };
}

describe("sites API", () => {
	it("creates a site in the Organization with UTC as the default timezone", async () => {
		const organization = await signedInOrganization();
		const response = await postSite({ name: "Blog", domain: "blog-create.example.com" });
		expect(response.status).toBe(201);
		const site = await response.json() as Site;
		expect(site).toMatchObject({ name: "Blog", domain: "blog-create.example.com", timezone: "UTC", organizationId: organization.id });
		expect(site.id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("rejects an unknown IANA timezone with 400 and the issues", async () => {
		const response = await postSite({ name: "Blog", domain: "blog-tz.example.com", timezone: "Mars/Olympus" });
		expect(response.status).toBe(400);
		const body = await response.json() as { data: { issues: { path: string[] }[] } };
		expect(body.data.issues.map(issue => issue.path)).toContainEqual(["timezone"]);
	});

	it("falls back to UTC for a blank timezone", async () => {
		const response = await postSite({ name: "Blog", domain: "blog-blank-tz.example.com", timezone: " " });
		expect(response.status).toBe(201);
		expect((await response.json() as Site).timezone).toBe("UTC");
	});

	it("rejects a missing name", async () => {
		const response = await postSite({ domain: "blog-name.example.com" });
		expect(response.status).toBe(400);
	});

	it("rejects a domain already used in the Organization with 409 and a readable message", async () => {
		const existing = await createSite();
		const response = await postSite({ name: "Copy", domain: existing.domain });
		expect(response.status).toBe(409);
		expect((await response.json() as { message: string }).message).toBe(`A site for ${existing.domain} already exists.`);
	});

	it("gets a site by id", async () => {
		const created = await createSite({ timezone: "Europe/Zurich" });
		expect(await $fetch<Site>(`/api/sites/${created.id}`)).toEqual(created);
	});

	it("returns 404 for an unknown site", async () => {
		const response = await fetch("/api/sites/does-not-exist");
		expect(response.status).toBe(404);
	});

	it("lists the Organization's sites ordered by name", async () => {
		const zulu = await createSite({ name: "zzz last" });
		const alpha = await createSite({ name: "000 first" });
		const names = (await $fetch<Site[]>(sitesPath(await signedInOrganization()))).map(site => site.name);
		expect(names.indexOf(alpha.name)).toBeLessThan(names.indexOf(zulu.name));
		expect(names).toEqual([...names].sort());
	});

	it("updates a site's name and timezone", async () => {
		const site = await createSite();
		const response = await patchAs({ fetch }, site.id, { name: "Renamed", timezone: "Europe/London" });
		expect(response.status).toBe(200);
		expect(await $fetch<Site>(`/api/sites/${site.id}`)).toMatchObject({ name: "Renamed", timezone: "Europe/London", domain: site.domain });
	});

	it("rejects an update to a domain another site in the Organization uses", async () => {
		const first = await createSite();
		const second = await createSite();
		expect((await patchAs({ fetch }, second.id, { domain: first.domain })).status).toBe(409);
		expect((await patchAs({ fetch }, second.id, { domain: second.domain })).status).toBe(200);
	});

	it("rejects an update with an unknown timezone or no fields", async () => {
		const site = await createSite();
		expect((await patchAs({ fetch }, site.id, { timezone: "Mars/Olympus" })).status).toBe(400);
		expect((await patchAs({ fetch }, site.id, {})).status).toBe(400);
	});

	it("deletes a site and answers 204", async () => {
		const site = await createSite();
		const response = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
		expect(response.status).toBe(204);
		expect((await fetch(`/api/sites/${site.id}`)).status).toBe(404);
	});

	it("deletes the site's raw and Rollup rows but keeps the shared device and Location rows", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH", "x-vercel-ip-city": "Bern" } });
		await waitForPageviews(site.id, 1);
		await testDb.execute({ sql: "INSERT INTO daily_summary VALUES (?, '2020-01-01', 1, 1, 1, 1, 0)", args: [site.id] });

		expect((await fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(204);

		for (const table of ["visitors", "visits", "pages", "sources", "daily_summary"]) {
			const rows = await testDb.execute({ sql: `SELECT COUNT(*) AS count FROM ${table} WHERE site_id = ?`, args: [site.id] });
			expect(Number(rows.rows[0]!.count), table).toBe(0);
		}
		const bern = await testDb.execute("SELECT COUNT(*) AS count FROM locations WHERE country = 'CH' AND region = '' AND city = 'Bern'");
		expect(Number(bern.rows[0]!.count)).toBe(1);
	});

	it("returns 404 when deleting an unknown site", async () => {
		const response = await fetch("/api/sites/does-not-exist", { method: "DELETE" });
		expect(response.status).toBe(404);
	});
});

describe("site roles", () => {
	it("does not let a Viewer create, change or delete Sites", async () => {
		const { organization, site, viewer } = await organizationWithRoles();

		expect((await postAs(viewer, sitesPath(organization), { name: "Nope", domain: "viewer.example.com" })).status).toBe(403);
		expect((await patchAs(viewer, site.id, { name: "Nope" })).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(403);

		expect(await viewer.$fetch<Site[]>(sitesPath(organization))).toEqual([expect.objectContaining({ id: site.id, name: site.name })]);
	});

	it("lets a Viewer read a Site's reports", async () => {
		const { site, viewer } = await organizationWithRoles();
		for (const report of ["", "/summary", "/timeseries", "/pages", "/visitors", "/live", "/realtime", "/goals", "/goal-conversions", "/funnels", "/journeys"]) {
			expect((await viewer.fetch(`/api/sites/${site.id}${report}`)).status, report).toBe(200);
		}
	});

	it("lets an Admin create, change and delete Sites", async () => {
		const { organization, admin } = await organizationWithRoles();

		const created = await postAs(admin, sitesPath(organization), { name: "By admin", domain: "admin.example.com" });
		expect(created.status).toBe(201);
		const site = await created.json() as Site;
		expect((await patchAs(admin, site.id, { timezone: "Asia/Tokyo" })).status).toBe(200);
		expect((await admin.fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(204);
	});
});

describe("site isolation", () => {
	it("keeps Sites in another Organization invisible", async () => {
		const { organization, site } = await organizationWithRoles();
		const stranger = await signUp("stranger");
		const strangerOrganization = await createOrganization(stranger);

		expect((await stranger.fetch(sitesPath(organization))).status).toBe(404);
		expect((await postAs(stranger, sitesPath(organization), { name: "Intruder", domain: "intruder.example.com" })).status).toBe(404);
		for (const report of ["", "/summary", "/timeseries", "/pages", "/sources", "/devices", "/locations", "/activity", "/event-properties?name=signup", "/page-stats", "/visitors", "/visitors/any-visitor", "/live", "/realtime", "/goals", "/goal-conversions", "/funnels", "/journeys"]) {
			expect((await stranger.fetch(`/api/sites/${site.id}${report}`)).status, report).toBe(404);
		}
		expect((await patchAs(stranger, site.id, { name: "Hijacked" })).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(404);
		expect(await stranger.$fetch<Site[]>(sitesPath(strangerOrganization))).toEqual([]);
	});

	it("deletes an Organization's Sites and their data with the Organization", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitFor(() => owner.$fetch<Summary>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews >= 1);

		expect((await postAs(owner, "/api/auth/organization/delete", { organizationId: organization.id })).status).toBe(200);

		expect((await owner.fetch(`/api/sites/${site.id}`)).status).toBe(404);
		for (const table of ["visitors", "visits", "pages"]) {
			const rows = await testDb.execute({ sql: `SELECT COUNT(*) AS count FROM ${table} WHERE site_id = ?`, args: [site.id] });
			expect(Number(rows.rows[0]!.count), table).toBe(0);
		}
	});
});
