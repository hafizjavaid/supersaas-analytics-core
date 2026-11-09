import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, getSummary, signedInOrganization, sitesPath, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";

await setupServer();

// No Events report exists yet (ticket 10), so stored Events are read from the database.
async function storedEvents(siteId: string) {
	const result = await testDb.execute({ sql: "SELECT name, props, path FROM events WHERE site_id = ? ORDER BY id", args: [siteId] });
	return result.rows.map(row => ({ name: row.name, props: row.props, path: row.path }));
}

describe("POST /collect", () => {
	it("answers 204 with permissive CORS", async () => {
		const site = await createSite();
		const response = await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("answers a preflight with 204", async () => {
		const response = await fetch("/collect", { method: "OPTIONS" });
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
	});

	it("records a Pageview as one Visitor, one Visit and a Bounce", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/", title: "Home" }, { ip: uniqueIp() });

		const summary = await waitForPageviews(site.id, 1);
		expect(summary).toMatchObject({ visitors: 1, visits: 1, pageviews: 1, bounceRate: 1, avgDurationSeconds: 0 });
		expect(summary.range.fromDate).toBe(summary.range.today);
	});

	it("extends the Visit when a second Pageview arrives within 30 minutes", async () => {
		const site = await createSite();
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);
		await collect({ site_id: site.id, path: "/pricing" }, { ip });

		const summary = await waitForPageviews(site.id, 2);
		expect(summary).toMatchObject({ visitors: 1, visits: 1, pageviews: 2, bounceRate: 0 });
	});

	it("starts a new Visit once 30 minutes have passed since the Visit started", async () => {
		const site = await createSite({ timezone: timezoneAwayFromMidnight() });
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);
		await testDb.execute({ sql: "UPDATE visits SET started_at = started_at - 1860, ended_at = ended_at - 1860 WHERE site_id = ?", args: [site.id] });
		await testDb.execute({ sql: "UPDATE pages SET timestamp = timestamp - 1860 WHERE site_id = ?", args: [site.id] });

		await collect({ site_id: site.id, path: "/blog" }, { ip });

		const summary = await waitForPageviews(site.id, 2);
		expect(summary).toMatchObject({ visitors: 1, visits: 2, pageviews: 2, bounceRate: 1 });
	});

	it("accepts a JSON content type as well as text/plain", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: { "content-type": "application/json" } });
		expect((await waitForPageviews(site.id, 1)).pageviews).toBe(1);
	});

	it.each([
		["an invalid body", "{not json"],
		["a body without a site_id", { path: "/" }],
		["an oversized body", { site_id: "x", path: "/", title: "x".repeat(17 * 1024) }],
	])("answers 204 for %s", async (_name, body) => {
		const response = await collect(body, { ip: uniqueIp() });
		expect(response.status).toBe(204);
	});

	it("drops a Pageview for an unknown Site", async () => {
		const response = await collect({ site_id: "unknown-site", path: "/" }, { ip: uniqueIp() });
		expect(response.status).toBe(204);
		await new Promise(resolve => setTimeout(resolve, 300));
		const rows = await testDb.execute({ sql: "SELECT COUNT(*) AS count FROM visitors WHERE site_id = ?", args: ["unknown-site"] });
		expect(Number(rows.rows[0]!.count)).toBe(0);
	});

	it("does not record a Pageview whose body was invalid", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: 42 }, { ip: uniqueIp() });
		await new Promise(resolve => setTimeout(resolve, 300));
		expect((await getSummary(site.id)).pageviews).toBe(0);
	});
});

describe("POST /collect from sd.js", () => {
	it("returns the Visitor id in a header sd.js can read cross-origin", async () => {
		const site = await createSite();
		const ip = uniqueIp();
		const first = await collect({ site_id: site.id, path: "/" }, { ip });
		const second = await collect({ site_id: site.id, name: "Signup" }, { ip });

		expect(first.status).toBe(204);
		expect(first.headers.get("access-control-expose-headers")).toBe("Sd-Visitor");
		expect(first.headers.get("sd-visitor")).toMatch(/^[0-9a-f]{32}$/);
		expect(second.headers.get("sd-visitor")).toBe(first.headers.get("sd-visitor"));
	});

	it("gives a different Visitor id to a different IP", async () => {
		const site = await createSite();
		const first = await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		const second = await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		expect(second.headers.get("sd-visitor")).not.toBe(first.headers.get("sd-visitor"));
	});

	it("records an Event sent by sd(name, props) inside the Visit", async () => {
		const site = await createSite();
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);

		const response = await collect({ site_id: site.id, name: "Signup", props: { plan: "pro" } }, { ip });

		expect(response.status).toBe(204);
		await letTheServerWrite();
		const events = await waitFor(() => storedEvents(site.id), rows => rows.length > 0);
		expect(events).toEqual([{ name: "Signup", props: JSON.stringify({ plan: "pro" }), path: null }]);
	});

	it("stores the auto-captured Events sd.js sends, each with its page path", async () => {
		const site = await createSite();
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/contact" }, { ip });
		await waitForPageviews(site.id, 1);

		const hits = [
			{ name: "Phone click", props: {}, path: "/contact" },
			{ name: "Email click", props: {}, path: "/contact" },
			{ name: "WhatsApp click", props: {}, path: "/contact" },
			{ name: "Form submit", path: "/contact" },
			{ name: "Book demo", props: { "plan": "pro", "billing-cycle": "yearly" }, path: "/pricing" },
		];
		for (const hit of hits) {
			await collect({ site_id: site.id, ...hit }, { ip });
		}

		await letTheServerWrite();
		const events = await waitFor(() => storedEvents(site.id), rows => rows.length === hits.length);
		expect(events).toHaveLength(hits.length);
		expect(events).toEqual(expect.arrayContaining([
			{ name: "Phone click", props: null, path: "/contact" },
			{ name: "Email click", props: null, path: "/contact" },
			{ name: "WhatsApp click", props: null, path: "/contact" },
			{ name: "Form submit", props: null, path: "/contact" },
			{ name: "Book demo", props: JSON.stringify({ "plan": "pro", "billing-cycle": "yearly" }), path: "/pricing" },
		]));
		expect((await getSummary(site.id)).pageviews).toBe(1);
	});

	it("accepts sd.identify and records no Pageview for it", async () => {
		const site = await createSite();
		const response = await collect({ site_id: site.id, identify: "user-42" }, { ip: uniqueIp() });

		expect(response.status).toBe(204);
		expect(response.headers.get("sd-visitor")).toMatch(/^[0-9a-f]{32}$/);
		await new Promise(resolve => setTimeout(resolve, 300));
		expect((await getSummary(site.id)).pageviews).toBe(0);
	});

	it("answers 204 with no Visitor id for an oversized identify id", async () => {
		const site = await createSite();
		const response = await collect({ site_id: site.id, identify: "x".repeat(300) }, { ip: uniqueIp() });
		expect(response.status).toBe(204);
		expect(response.headers.get("sd-visitor")).toBeNull();
	});
});

// Reading the file while the server writes can make that write fail with SQLITE_BUSY, so give it a head start.
function letTheServerWrite() {
	return new Promise(resolve => setTimeout(resolve, 500));
}

async function storedVisitors(siteId: string) {
	const result = await testDb.execute({ sql: "SELECT * FROM visitors WHERE site_id = ? ORDER BY first_seen", args: [siteId] });
	return result.rows;
}

async function siteSecret(siteId: string) {
	const result = await testDb.execute({ sql: "SELECT secret FROM sites WHERE id = ?", args: [siteId] });
	return String(result.rows[0]!.secret);
}

async function endTheUtcDay() {
	const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
	await testDb.execute({ sql: "UPDATE daily_salts SET day = ?", args: [yesterday] });
}

describe("daily salt", () => {
	it("gives the same IP and User-Agent two Visitors on two days", async () => {
		const site = await createSite({ timezone: timezoneAwayFromMidnight() });
		const ip = uniqueIp();
		const firstDay = await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);
		await letTheServerWrite();

		await endTheUtcDay();
		const secondDay = await collect({ site_id: site.id, path: "/" }, { ip });

		expect(secondDay.headers.get("sd-visitor")).toMatch(/^[0-9a-f]{32}$/);
		expect(secondDay.headers.get("sd-visitor")).not.toBe(firstDay.headers.get("sd-visitor"));
		expect(await waitForPageviews(site.id, 2)).toMatchObject({ visitors: 2, visits: 2, pageviews: 2 });
	});

	it("deletes a day's salt once the day has ended", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 1);
		await letTheServerWrite();
		await endTheUtcDay();

		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitForPageviews(site.id, 2);
		await letTheServerWrite();

		const today = new Date().toISOString().slice(0, 10);
		const salts = await testDb.execute("SELECT day FROM daily_salts");
		expect(salts.rows.map(row => row.day)).toEqual([today]);
	});
});

describe("sd.identify", () => {
	it("stores only the Site-keyed hash of the identify id, never the id", async () => {
		const site = await createSite();
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await waitForPageviews(site.id, 1);
		await collect({ site_id: site.id, identify: "person@example.com" }, { ip });
		await letTheServerWrite();

		const visitors = await waitFor(() => storedVisitors(site.id), rows => rows.some(row => row.identity_hash));
		const expectedHash = createHmac("sha256", await siteSecret(site.id)).update("person@example.com").digest("hex");
		expect(visitors).toHaveLength(1);
		expect(visitors[0]!.identity_hash).toBe(expectedHash);
		expect(JSON.stringify(visitors)).not.toContain("person@example.com");
	});

	it("gives two Visitors identified with the same id the same hash", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, identify: "user-42" }, { ip: uniqueIp() });
		await collect({ site_id: site.id, identify: "user-42" }, { ip: uniqueIp() });
		await letTheServerWrite();

		const visitors = await waitFor(() => storedVisitors(site.id), rows => rows.filter(row => row.identity_hash).length === 2);
		expect(visitors).toHaveLength(2);
		expect(visitors[0]!.id).not.toBe(visitors[1]!.id);
		expect(visitors[0]!.identity_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(visitors[1]!.identity_hash).toBe(visitors[0]!.identity_hash);
	});

	it("hashes the same id differently on another Site", async () => {
		const [first, second] = await Promise.all([createSite(), createSite()]);
		const ip = uniqueIp();
		await collect({ site_id: first.id, identify: "user-42" }, { ip });
		await collect({ site_id: second.id, identify: "user-42" }, { ip });
		await letTheServerWrite();

		const [firstVisitors, secondVisitors] = await Promise.all([
			waitFor(() => storedVisitors(first.id), rows => rows.length > 0),
			waitFor(() => storedVisitors(second.id), rows => rows.length > 0),
		]);
		expect(firstVisitors[0]!.identity_hash).not.toBe(secondVisitors[0]!.identity_hash);
	});

	it("never returns the Site secret from the API", async () => {
		const site = await createSite();
		const listed = await $fetch<Record<string, unknown>[]>(sitesPath(await signedInOrganization()));
		const fetched = await $fetch<Record<string, unknown>>(`/api/sites/${site.id}`);
		const updated = await $fetch<Record<string, unknown>>(`/api/sites/${site.id}`, { method: "PATCH", body: { timezone: "Asia/Tokyo" } });

		expect(site).not.toHaveProperty("secret");
		expect(fetched).not.toHaveProperty("secret");
		expect(updated).not.toHaveProperty("secret");
		expect(listed.every(row => !("secret" in row))).toBe(true);
	});
});

describe("GET /sd.js", () => {
	it("serves the minified Tracking snippet to any origin", async () => {
		const response = await fetch("/sd.js");
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		const script = await response.text();
		expect(script).toContain("sd-visitor");
		expect(script).not.toContain("Cookieless");
	});

	it("no longer serves /script.js", async () => {
		const response = await fetch("/script.js");
		expect(response.status).toBe(404);
	});
});

describe("GET /api/sites/:id/summary", () => {
	it("returns 404 for an unknown Site", async () => {
		const response = await fetch("/api/sites/unknown-site/summary");
		expect(response.status).toBe(404);
	});

	it("defaults to the last 30 days", async () => {
		const site = await createSite();
		const { range } = await $fetch<{ range: { fromDate: string; toDate: string } }>(`/api/sites/${site.id}/summary`);
		const days = (Date.parse(range.toDate) - Date.parse(range.fromDate)) / 86_400_000;
		expect(days).toBe(29);
	});
});
