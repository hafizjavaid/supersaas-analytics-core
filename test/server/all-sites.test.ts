import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, collect, createOrganization, createSiteAs, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import type { AllSitesOverview } from "#layers/core/shared/types/analytics";

await setupServer();

const HOUR = 3600;

function overviewPath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/overview`;
}

function getOverview(user: TestUser, organization: TestOrganization) {
	return user.$fetch<AllSitesOverview>(overviewPath(organization));
}

async function newOrganization() {
	const owner = await signUp("owner");
	return { owner, organization: await createOrganization(owner) };
}

function waitForPageviews(user: TestUser, organization: TestOrganization, pageviews: number) {
	return waitFor(() => getOverview(user, organization), overview => overview.totals.pageviews >= pageviews);
}

async function moveRecentRowsBack(siteId: string, seconds: number) {
	const recent = Math.floor(Date.now() / 1000) - 600;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ? AND started_at >= ?", args: [seconds, seconds, siteId, recent] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ? AND timestamp >= ?", args: [seconds, siteId, recent] },
	]);
}

describe("GET /api/organizations/:id/overview", () => {
	it("answers an Organization without Sites with zero totals", async () => {
		const { owner, organization } = await newOrganization();

		expect(await getOverview(owner, organization)).toEqual({
			totals: { visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 }, revenue: [], searchClicks: null },
			sites: [],
		});
	});

	it("lists every Site by name with zeros and 24 hourly points", async () => {
		const { owner, organization } = await newOrganization();
		await createSiteAs(owner, organization, { name: "Beta" });
		await createSiteAs(owner, organization, { name: "Alpha" });

		const { sites } = await getOverview(owner, organization);
		expect(sites.map(entry => entry.site.name)).toEqual(["Alpha", "Beta"]);
		for (const entry of sites) {
			expect(entry).toMatchObject({ visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 } });
			expect(entry.trend).toHaveLength(24);
			expect(entry.trend.every((point, index) => index === 0 || point.timestamp - entry.trend[index - 1]!.timestamp === HOUR * 1000)).toBe(true);
			expect(entry.site).not.toHaveProperty("secret");
		}
	});

	it("counts the last 24 hours per Site against the 24 hours before and sums them", async () => {
		const { owner, organization } = await newOrganization();
		const busy = await createSiteAs(owner, organization, { name: "Busy" });
		const quiet = await createSiteAs(owner, organization, { name: "Quiet" });

		await collect({ site_id: busy.id, path: "/last-week" }, { ip: uniqueIp() });
		await waitForPageviews(owner, organization, 1);
		await moveRecentRowsBack(busy.id, 7 * 24 * HOUR);
		await collect({ site_id: busy.id, path: "/previous" }, { ip: uniqueIp() });
		await collect({ site_id: busy.id, path: "/previous" }, { ip: uniqueIp() });
		await waitForPageviews(owner, organization, 2);
		await moveRecentRowsBack(busy.id, 30 * HOUR);

		const visitorIp = uniqueIp();
		await collect({ site_id: busy.id, path: "/" }, { ip: visitorIp });
		await collect({ site_id: busy.id, path: "/pricing" }, { ip: visitorIp });
		await collect({ site_id: busy.id, path: "/" }, { ip: uniqueIp() });
		await collect({ site_id: quiet.id, path: "/" }, { ip: uniqueIp() });
		const overview = await waitForPageviews(owner, organization, 4);

		const [busyEntry, quietEntry] = overview.sites;
		expect(busyEntry).toMatchObject({ visitors: 2, pageviews: 3, previous: { visitors: 2, pageviews: 2 } });
		expect(quietEntry).toMatchObject({ visitors: 1, pageviews: 1, previous: { visitors: 0, pageviews: 0 } });
		expect(overview.totals).toMatchObject({ visitors: 3, pageviews: 4, previous: { visitors: 2, pageviews: 2 } });

		expect(busyEntry!.trend.reduce((sum, point) => sum + point.pageviews, 0)).toBe(3);
		expect(busyEntry!.trend.at(-1)).toMatchObject({ visitors: 2, pageviews: 3 });
	});

	it("puts a Pageview from 20 hours ago in an earlier hour of the trend", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/earlier" }, { ip: uniqueIp() });
		await waitForPageviews(owner, organization, 1);
		await moveRecentRowsBack(site.id, 20 * HOUR);
		await collect({ site_id: site.id, path: "/now" }, { ip: uniqueIp() });
		const { sites } = await waitForPageviews(owner, organization, 2);

		const pageviews = sites[0]!.trend.map(point => point.pageviews);
		expect(pageviews.at(-1)).toBe(1);
		expect(pageviews.slice(0, -1).reduce((sum, count) => sum + count, 0)).toBe(1);
		expect(pageviews.findIndex(count => count > 0)).toBeGreaterThanOrEqual(2);
		expect(pageviews.findIndex(count => count > 0)).toBeLessThanOrEqual(4);
	});

	it("counts Live visitors per Site and in total", async () => {
		const { owner, organization } = await newOrganization();
		const first = await createSiteAs(owner, organization, { name: "First" });
		const second = await createSiteAs(owner, organization, { name: "Second" });
		await collect({ site_id: first.id, path: "/" }, { ip: uniqueIp() });
		await collect({ site_id: first.id, path: "/" }, { ip: uniqueIp() });
		await collect({ site_id: second.id, path: "/" }, { ip: uniqueIp() });
		await collect({ site_id: second.id, path: "/" }, { ip: uniqueIp() });
		await waitFor(() => getOverview(owner, organization), overview => overview.totals.live === 4);
		await testDb.execute({
			sql: "UPDATE visitors SET last_seen = last_seen - 301 WHERE id = (SELECT id FROM visitors WHERE site_id = ? LIMIT 1)",
			args: [second.id],
		});

		const overview = await getOverview(owner, organization);
		expect(overview.sites.map(entry => entry.live)).toEqual([2, 1]);
		expect(overview.totals.live).toBe(3);
	});

	it("leaves out the Sites of other Organizations", async () => {
		const { owner, organization } = await newOrganization();
		const mine = await createSiteAs(owner, organization);
		const other = await newOrganization();
		const theirs = await createSiteAs(other.owner, other.organization);
		await collect({ site_id: theirs.id, path: "/" }, { ip: uniqueIp() });
		await waitForPageviews(other.owner, other.organization, 1);

		const overview = await getOverview(owner, organization);
		expect(overview.sites.map(entry => entry.site.id)).toEqual([mine.id]);
		expect(overview.totals.pageviews).toBe(0);
	});

	it("lets a Viewer read it and answers 404 to a stranger", async () => {
		const { owner, organization } = await newOrganization();
		await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		const stranger = await signUp("stranger");

		expect((await getOverview(viewer, organization)).sites).toHaveLength(1);
		expect((await stranger.fetch(overviewPath(organization))).status).toBe(404);
	});
});
