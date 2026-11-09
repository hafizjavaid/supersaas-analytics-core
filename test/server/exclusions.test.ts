import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, addMember, anonymousFetch, collect, createSite, fetch, getSummary, signedIn, signedInOrganization, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Hit } from "./helpers";
import type { LiveVisitors, Site, TopEventRow } from "#layers/core/shared/types/analytics";

await setupServer();

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function updateExclusions(siteId: string, body: Partial<Pick<Site, "excludedIps" | "excludedPaths">>) {
	return $fetch<Site>(`/api/sites/${siteId}`, { method: "PATCH", body });
}

async function siteExcluding(exclusions: Partial<Pick<Site, "excludedIps" | "excludedPaths">>) {
	const site = await createSite();
	await updateExclusions(site.id, exclusions);
	return site;
}

// The control hit is sent after the excluded one, so once it is counted the excluded hit has been handled too.
async function expectOnlyControlHitCounted(siteId: string, sendControlHit: () => Promise<unknown>) {
	await sendControlHit();
	const summary = await waitForPageviews(siteId, 1);
	expect(summary).toMatchObject({ visitors: 1, visits: 1, pageviews: 1 });
	expect((await $fetch<LiveVisitors>(`/api/sites/${siteId}/live`)).count).toBe(1);
}

async function expectDropped(siteId: string, body: object, hit: Hit) {
	const response = await collect({ site_id: siteId, ...body }, hit);
	expect(response.status).toBe(204);
}

describe("Site exclusion settings", () => {
	it("starts a new Site with no exclusions", async () => {
		const site = await createSite();
		expect(site).toMatchObject({ excludedIps: [], excludedPaths: [] });
	});

	it("saves IPs, CIDRs and path globs trimmed and without duplicates", async () => {
		const site = await createSite();
		const updated = await updateExclusions(site.id, {
			excludedIps: [" 192.0.2.10 ", "192.0.2.10", "2001:DB8::/32"],
			excludedPaths: ["/admin/*", " /preview "],
		});
		expect(updated).toMatchObject({ excludedIps: ["192.0.2.10", "2001:db8::/32"], excludedPaths: ["/admin/*", "/preview"] });
		expect(await $fetch<Site>(`/api/sites/${site.id}`)).toMatchObject(updated);
	});

	it.each([
		["an invalid IP", { excludedIps: ["192.0.2.300"] }],
		["an invalid CIDR prefix", { excludedIps: ["192.0.2.0/40"] }],
		["a path without a leading slash", { excludedPaths: ["admin/*"] }],
		["too many rules", { excludedPaths: Array.from({ length: 101 }, (_, index) => `/p${index}`) }],
	])("rejects %s with 400", async (_name, body) => {
		const site = await createSite();
		const response = await fetch(`/api/sites/${site.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		expect(response.status).toBe(400);
	});

	it("does not let a Viewer change exclusions", async () => {
		const site = await createSite();
		const viewer = await addMember(await signedIn(), (await signedInOrganization()).id, "viewer");
		const response = await viewer.fetch(`/api/sites/${site.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ excludedIps: ["192.0.2.10"] }) });
		expect(response.status).toBe(403);
	});
});

describe("GET /api/client-ip", () => {
	it("returns the IP the request came from", async () => {
		const response = await $fetch<{ ip: string }>("/api/client-ip", { headers: { "cf-connecting-ip": "192.0.2.77" } });
		expect(response).toEqual({ ip: "192.0.2.77" });
	});

	it("returns the visitor's IP that a proxy forwarded, not the proxy's", async () => {
		const response = await $fetch<{ ip: string }>("/api/client-ip", { headers: { "x-forwarded-for": "192.0.2.88, 10.0.0.1", "cf-connecting-ip": "10.0.0.1" } });
		expect(response).toEqual({ ip: "192.0.2.88" });
	});

	it("skips a private forwarded address, which names infrastructure rather than the visitor", async () => {
		const response = await $fetch<{ ip: string }>("/api/client-ip", { headers: { "x-forwarded-for": "10.0.0.9", "cf-connecting-ip": "192.0.2.78" } });
		expect(response).toEqual({ ip: "192.0.2.78" });
	});

	it("requires a signed-in user", async () => {
		expect((await anonymousFetch("/api/client-ip")).status).toBe(401);
	});
});

describe("POST /collect with exclusions", () => {
	it("drops a hit from an ignored IP", async () => {
		const site = await siteExcluding({ excludedIps: ["192.0.2.10"] });
		await expectDropped(site.id, { path: "/" }, { ip: "192.0.2.10" });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: "192.0.2.11" }));
	});

	it("drops a hit from an ignored IP forwarded by a proxy", async () => {
		const site = await siteExcluding({ excludedIps: ["192.0.2.12"] });
		const proxy = "10.0.0.2";
		await expectDropped(site.id, { path: "/" }, { ip: proxy, headers: { "x-forwarded-for": "192.0.2.12" } });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: proxy, headers: { "x-forwarded-for": "192.0.2.13" } }));
	});

	it("drops a hit from inside an ignored CIDR range", async () => {
		const site = await siteExcluding({ excludedIps: ["192.0.2.0/24"] });
		await expectDropped(site.id, { path: "/" }, { ip: "192.0.2.200" });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() }));
	});

	it("drops a hit from an ignored IPv6 range", async () => {
		const site = await siteExcluding({ excludedIps: ["2001:db8::/32"] });
		await expectDropped(site.id, { path: "/" }, { ip: "2001:db8:1234::1" });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() }));
	});

	it("drops identify(), Events and Outbound links from an ignored IP", async () => {
		const site = await siteExcluding({ excludedIps: ["192.0.2.20"] });
		await expectDropped(site.id, { identify: "user-1" }, { ip: "192.0.2.20" });
		await expectDropped(site.id, { name: "Signup", path: "/" }, { ip: "192.0.2.20" });
		await expectDropped(site.id, { outbound_url: "https://elsewhere.example.org/" }, { ip: "192.0.2.20" });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() }));
	});

	it("drops a Pageview on an excluded path glob but keeps other paths", async () => {
		const site = await siteExcluding({ excludedPaths: ["/admin/*"] });
		const ip = uniqueIp();
		await expectDropped(site.id, { path: "/admin/users/42" }, { ip });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/admin" }, { ip }));
	});

	it("drops an Event sent from an excluded path", async () => {
		const site = await siteExcluding({ excludedPaths: ["/checkout/*"] });
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);
		await expectDropped(site.id, { name: "Paid", path: "/checkout/done" }, { ip });
		await collect({ site_id: site.id, name: "Signup", path: "/" }, { ip });

		const events = await waitForEvents(site.id, rows => rows.length > 0);
		expect(events).toEqual([{ name: "Signup", path: "/", count: 1 }]);
	});

	it.each([
		["a known bot", GOOGLEBOT],
		["a headless browser", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36"],
		["an empty User-Agent", ""],
	])("drops a hit from %s", async (_name, userAgent) => {
		const site = await createSite();
		await expectDropped(site.id, { path: "/" }, { ip: uniqueIp(), userAgent });
		await expectOnlyControlHitCounted(site.id, () => collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() }));
	});

	it("applies one Site's exclusions to that Site only", async () => {
		const excluding = await siteExcluding({ excludedIps: ["192.0.2.30"], excludedPaths: ["/admin/*"] });
		const other = await createSite();
		await collect({ site_id: excluding.id, path: "/admin/x" }, { ip: "192.0.2.30" });
		await collect({ site_id: other.id, path: "/admin/x" }, { ip: "192.0.2.30" });

		expect((await waitForPageviews(other.id, 1)).pageviews).toBe(1);
		expect((await getSummary(excluding.id)).pageviews).toBe(0);
	});
});

function waitForEvents(siteId: string, isDone: (rows: TopEventRow[]) => boolean) {
	return waitFor(async () => (await $fetch<{ rows: TopEventRow[] }>(`/api/sites/${siteId}/activity?range=today`)).rows, isDone);
}
