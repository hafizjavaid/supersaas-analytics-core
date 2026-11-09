import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, anonymous$fetch, anonymousFetch, collect, createOrganization, createSite, createSiteAs, fetch, postAs, signUp, testDb, uniqueIp, waitForPageviews } from "./helpers";
import type { Funnel, ShareLink, SharedDashboard, Summary } from "#layers/core/shared/types/analytics";

await setupServer();

function sharePath(token: string, report = "") {
	return `/api/share/${token}${report}`;
}

function createLink(siteId: string, body: Record<string, unknown>) {
	return fetch(`/api/sites/${siteId}/share-links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function createShareLink(siteId: string, body: Record<string, unknown> = { name: "Public" }) {
	const response = await createLink(siteId, body);
	expect(response.status).toBe(201);
	return await response.json() as ShareLink;
}

function unlock(token: string, password: string) {
	return anonymousFetch(sharePath(token, "/unlock"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ password }),
	});
}

function cookieOf(response: Response) {
	return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]!).join("; ");
}

describe("managing Share links", () => {
	it("creates several links per Site, lists them without any password and revokes one", async () => {
		const site = await createSite();
		const open = await createShareLink(site.id, { name: "Investors" });
		const locked = await createShareLink(site.id, { name: "Agency", password: "s3cret-pass" });

		expect(open).toMatchObject({ name: "Investors", hasPassword: false });
		expect(locked).toMatchObject({ name: "Agency", hasPassword: true });
		expect(open.token).toMatch(/^[\w-]{32,}$/);
		expect(open.token).not.toBe(locked.token);

		const listed = await $fetch<ShareLink[]>(`/api/sites/${site.id}/share-links`);
		expect(listed).toEqual([open, locked]);
		expect(JSON.stringify(listed)).not.toContain("s3cret-pass");
		expect(JSON.stringify(listed)).not.toContain("passwordHash");

		expect((await fetch(`/api/sites/${site.id}/share-links/${open.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await fetch(`/api/sites/${site.id}/share-links/${open.id}`, { method: "DELETE" })).status).toBe(404);
		expect(await $fetch<ShareLink[]>(`/api/sites/${site.id}/share-links`)).toEqual([locked]);
	});

	it("rejects a link without a name or with a too short password", async () => {
		const site = await createSite();
		expect((await createLink(site.id, { name: "" })).status).toBe(400);
		expect((await createLink(site.id, {})).status).toBe(400);
		expect((await createLink(site.id, { name: "Short", password: "abc" })).status).toBe(400);
	});

	it("lets Owners and Admins manage links, but not Viewers or strangers", async () => {
		const owner = await signUp("owner");
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const admin = await addMember(owner, organization.id, "admin");
		const viewer = await addMember(owner, organization.id, "viewer");
		const stranger = await signUp("stranger");
		await createOrganization(stranger);

		const created = await postAs(admin, `/api/sites/${site.id}/share-links`, { name: "By admin" });
		expect(created.status).toBe(201);
		const link = await created.json() as ShareLink;
		expect((await admin.fetch(`/api/sites/${site.id}/share-links`)).status).toBe(200);

		expect((await postAs(viewer, `/api/sites/${site.id}/share-links`, { name: "Nope" })).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}/share-links`)).status).toBe(403);
		expect((await viewer.fetch(`/api/sites/${site.id}/share-links/${link.id}`, { method: "DELETE" })).status).toBe(403);

		expect((await postAs(stranger, `/api/sites/${site.id}/share-links`, { name: "Nope" })).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/share-links`)).status).toBe(404);
		expect((await stranger.fetch(`/api/sites/${site.id}/share-links/${link.id}`, { method: "DELETE" })).status).toBe(404);

		const otherSite = await createSiteAs(owner, organization);
		expect((await owner.fetch(`/api/sites/${otherSite.id}/share-links/${link.id}`, { method: "DELETE" })).status).toBe(404);
		expect((await anonymousFetch(sharePath(link.token))).status).toBe(200);
	});

	it("deletes a Site's links with the Site", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id);
		expect((await fetch(`/api/sites/${site.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await anonymousFetch(sharePath(link.token))).status).toBe(404);
		const rows = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM share_links WHERE site_id = ?", args: [site.id] });
		expect(Number(rows.rows[0]!.count)).toBe(0);
	});
});

describe("viewing a Share link", () => {
	it("shows the Site's name, domain and timezone to anyone with the link, and nothing of its settings", async () => {
		const site = await createSite({ timezone: "Asia/Tokyo" });
		const link = await createShareLink(site.id, { name: "Public" });

		const shared = await anonymous$fetch<SharedDashboard>(sharePath(link.token));
		expect(shared).toEqual({ locked: false, site: { id: site.id, name: site.name, domain: site.domain, timezone: "Asia/Tokyo" }, outboundUrl: null });
	});

	it("reads the dashboard reports of its Site with the Range and Filters, as a Member sees them", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id);
		await collect({ site_id: site.id, path: "/pricing" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "DE" } });
		await waitForPageviews(site.id, 2);

		const filter = `f=${encodeURIComponent("country:CH")}`;
		for (const report of ["/summary", "/timeseries", "/pages", "/sources", "/devices", "/locations", "/activity", "/goal-conversions", "/page-stats"]) {
			const query = `?range=today&${filter}`;
			const shared = await anonymous$fetch(sharePath(link.token, `${report}${query}`));
			expect(shared, report).toEqual(await $fetch(`/api/sites/${site.id}${report}${query}`));
		}
		const summary = await anonymous$fetch<Summary>(sharePath(link.token, `/summary?range=today&${filter}`));
		expect(summary.pageviews).toBe(1);
		expect((await anonymousFetch(sharePath(link.token, "/event-properties?name=signup"))).status).toBe(200);
		expect((await anonymousFetch(sharePath(link.token, "/live"))).status).toBe(200);
	});

	it("reads the Site's Funnels and their reports, but no other Site's", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id);
		const definition = { name: "Pricing to signup", window: "24h", steps: [{ kind: "page", value: "/" }, { kind: "page", value: "/pricing" }] };
		const funnel = await $fetch<Funnel>(`/api/sites/${site.id}/funnels`, { method: "POST", body: definition });
		const otherSite = await createSite();
		const otherFunnel = await $fetch<Funnel>(`/api/sites/${otherSite.id}/funnels`, { method: "POST", body: definition });

		expect(await anonymous$fetch<Funnel[]>(sharePath(link.token, "/funnels"))).toEqual([funnel]);
		expect((await anonymousFetch(sharePath(link.token, `/funnels/${funnel.id}/report?range=today`))).status).toBe(200);
		expect((await anonymousFetch(sharePath(link.token, `/funnels/${otherFunnel.id}/report`))).status).toBe(404);
	});

	it("answers 404 to a revoked or unknown token", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id);
		expect((await anonymousFetch(sharePath(link.token, "/summary"))).status).toBe(200);

		expect((await fetch(`/api/sites/${site.id}/share-links/${link.id}`, { method: "DELETE" })).status).toBe(204);
		for (const report of ["", "/summary", "/pages", "/funnels"]) {
			expect((await anonymousFetch(sharePath(link.token, report))).status, report).toBe(404);
		}
		expect((await anonymousFetch(sharePath("not-a-real-token", "/summary"))).status).toBe(404);
	});
});

describe("a password-protected Share link", () => {
	it("hides the Site and every report until the password is given", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id, { name: "Agency", password: "s3cret-pass" });

		expect(await anonymous$fetch<SharedDashboard>(sharePath(link.token))).toEqual({ locked: true });
		for (const report of ["/summary", "/timeseries", "/pages", "/page-stats", "/funnels", "/live"]) {
			expect((await anonymousFetch(sharePath(link.token, report))).status, report).toBe(401);
		}
	});

	it("refuses a wrong password", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id, { password: "s3cret-pass", name: "Agency" });
		const response = await unlock(link.token, "wrong-password");
		expect(response.status).toBe(401);
		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it("opens the dashboard once the right password is given", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id, { password: "s3cret-pass", name: "Agency" });
		const unlocked = await unlock(link.token, "s3cret-pass");
		expect(unlocked.status).toBe(204);
		const headers = { cookie: cookieOf(unlocked) };

		expect(await anonymous$fetch<SharedDashboard>(sharePath(link.token), { headers })).toMatchObject({ locked: false, site: { id: site.id } });
		expect((await anonymousFetch(sharePath(link.token, "/summary"), { headers })).status).toBe(200);
	});

	it("does not let one link's unlock open another link", async () => {
		const site = await createSite();
		const first = await createShareLink(site.id, { password: "s3cret-pass", name: "First" });
		const second = await createShareLink(site.id, { password: "s3cret-pass", name: "Second" });
		const headers = { cookie: cookieOf(await unlock(first.token, "s3cret-pass")) };
		expect((await anonymousFetch(sharePath(second.token, "/summary"), { headers })).status).toBe(401);
	});

	it("locks again after the link is revoked", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id, { password: "s3cret-pass", name: "Agency" });
		const headers = { cookie: cookieOf(await unlock(link.token, "s3cret-pass")) };
		expect((await fetch(`/api/sites/${site.id}/share-links/${link.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await anonymousFetch(sharePath(link.token, "/summary"), { headers })).status).toBe(404);
	});
});

describe("what a Share link never reaches", () => {
	it("cannot reach Users, Visitor journeys, the realtime Visitor list, Journeys or any setting", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id);
		const response = await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		const visitorId = response.headers.get("sd-visitor")!;
		await waitForPageviews(site.id, 1);

		for (const report of ["/visitors", `/visitors/${visitorId}`, "/realtime", "/journeys", "/goals", "/share-links", "/payments"]) {
			expect((await anonymousFetch(sharePath(link.token, report))).status, report).toBe(404);
		}
		for (const [method, report] of [["POST", "/funnel-preview"], ["POST", "/funnels"], ["POST", "/goals"], ["POST", "/share-links"], ["PATCH", ""], ["DELETE", ""]] as const) {
			const answer = await anonymousFetch(sharePath(link.token, report), { method, headers: { "content-type": "application/json" }, body: "{}" });
			expect([404, 405], `${method} ${report}`).toContain(answer.status);
		}
	});

	it("opens nothing under the Site API, with or without an unlocked Share cookie", async () => {
		const site = await createSite();
		const link = await createShareLink(site.id, { password: "s3cret-pass", name: "Agency" });
		const cookie = cookieOf(await unlock(link.token, "s3cret-pass"));

		for (const report of ["", "/summary", "/visitors", "/realtime", "/journeys", "/share-links"]) {
			for (const headers of [{}, { cookie }, { authorization: `Bearer ${link.token}` }]) {
				expect((await anonymousFetch(`/api/sites/${site.id}${report}?token=${link.token}`, { headers })).status, report).toBe(401);
			}
		}
	});
});
