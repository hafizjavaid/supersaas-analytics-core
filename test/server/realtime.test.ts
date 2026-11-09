import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, collect, createOrganization, createSiteAs, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import type { Realtime } from "#layers/core/shared/types/analytics";
import { visitorLabel } from "#layers/core/shared/utils/visitors";

await setupServer();

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const BERN = { "x-vercel-ip-country": "CH", "x-vercel-ip-country-region": "BE", "x-vercel-ip-city": "Bern", "x-vercel-ip-latitude": "46.95", "x-vercel-ip-longitude": "7.45" };
const TOKYO = { "x-vercel-ip-country": "JP", "x-vercel-ip-city": "Tokyo", "x-vercel-ip-latitude": "35.68", "x-vercel-ip-longitude": "139.69" };

function realtimePath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/realtime`;
}

function getRealtime(user: TestUser, organization: TestOrganization) {
	return user.$fetch<Realtime>(realtimePath(organization));
}

function waitForLive(user: TestUser, organization: TestOrganization, count: number) {
	return waitFor(() => getRealtime(user, organization), realtime => realtime.count >= count && realtime.visitors.length >= count);
}

async function newOrganization() {
	const owner = await signUp("owner");
	return { owner, organization: await createOrganization(owner) };
}

describe("GET /api/organizations/:id/realtime", () => {
	it("answers an Organization without traffic with zeros and 30 one-minute points", async () => {
		const { owner, organization } = await newOrganization();
		await createSiteAs(owner, organization);

		const realtime = await getRealtime(owner, organization);
		expect(realtime).toMatchObject({ count: 0, locations: [], referrers: [], countries: [], devices: [], visitors: [], pageviews: { total: 0, peak: 0 } });
		expect(realtime.pageviews.points).toHaveLength(30);
		expect(realtime.pageviews.points.every((point, index) => index === 0 || point.timestamp - realtime.pageviews.points[index - 1]!.timestamp === 60_000)).toBe(true);
	});

	it("lists the Live visitors of every Site with their Site, page, place, device and Source", async () => {
		const { owner, organization } = await newOrganization();
		const shop = await createSiteAs(owner, organization, { name: "Shop" });
		const blog = await createSiteAs(owner, organization, { name: "Blog" });
		const shopper = { ip: uniqueIp(), userAgent: IPHONE_SAFARI, headers: BERN };
		const shopperId = (await collect({ site_id: shop.id, path: "/", referrer: "https://www.google.com/search?q=shop" }, shopper)).headers.get("sd-visitor")!;
		await waitForLive(owner, organization, 1);
		await collect({ site_id: shop.id, path: "/pricing" }, shopper);
		const readerId = (await collect({ site_id: blog.id, path: "/posts/hello" }, { ip: uniqueIp(), headers: TOKYO })).headers.get("sd-visitor")!;

		const realtime = await waitFor(() => getRealtime(owner, organization), value => value.pageviews.total === 3 && value.visitors.length === 2);
		expect(realtime.count).toBe(2);
		const byId = new Map(realtime.visitors.map(visitor => [visitor.id, visitor]));
		expect(byId.get(shopperId)).toMatchObject({
			label: visitorLabel(shopperId),
			site: { id: shop.id, name: "Shop", domain: shop.domain },
			path: "/pricing",
			location: { country: "CH", region: "BE", city: "Bern" },
			device: { browser: "Safari", os: "iOS", deviceType: "mobile" },
			source: { channel: "search", referrerDomain: "google.com" },
			coordinates: { latitude: 46.95, longitude: 7.45 },
		});
		expect(byId.get(readerId)).toMatchObject({
			site: { id: blog.id, name: "Blog" },
			path: "/posts/hello",
			location: { country: "JP", city: "Tokyo" },
			device: { browser: "Chrome", deviceType: "desktop" },
			source: { channel: "direct", referrerDomain: "(direct)" },
		});
		expect(realtime.locations).toHaveLength(2);
	});

	it("orders the list by last seen and breaks Live visitors down into referrer, country and device chips", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		const earlierId = (await collect({ site_id: site.id, path: "/", referrer: "https://news.ycombinator.com/" }, { ip: uniqueIp(), headers: BERN })).headers.get("sd-visitor")!;
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: BERN, userAgent: IPHONE_SAFARI });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: TOKYO, userAgent: IPHONE_SAFARI });
		await waitForLive(owner, organization, 3);
		await testDb.execute({ sql: "UPDATE visitors SET last_seen = last_seen - 120 WHERE id = ?", args: [earlierId] });

		const realtime = await getRealtime(owner, organization);
		expect(realtime.visitors.at(-1)!.id).toBe(earlierId);
		expect(realtime.referrers).toEqual([{ value: "(direct)", count: 2 }, { value: "news.ycombinator.com", count: 1 }]);
		expect(realtime.countries).toEqual([{ value: "CH", count: 2 }, { value: "JP", count: 1 }]);
		expect(realtime.devices).toEqual([{ value: "mobile", count: 2 }, { value: "desktop", count: 1 }]);
	});

	it("counts the last 30 minutes of Pageviews per minute with their peak", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/old" }, { ip: uniqueIp() });
		await collect({ site_id: site.id, path: "/earlier" }, { ip: uniqueIp() });
		await waitFor(() => getRealtime(owner, organization), value => value.pageviews.total === 2);
		await testDb.batch([
			{ sql: "UPDATE pages SET timestamp = timestamp - 2400 WHERE site_id = ? AND path = '/old'", args: [site.id] },
			{ sql: "UPDATE pages SET timestamp = timestamp - 600 WHERE site_id = ? AND path = '/earlier'", args: [site.id] },
		]);
		const ip = uniqueIp();
		await collect({ site_id: site.id, path: "/" }, { ip });
		await collect({ site_id: site.id, path: "/a" }, { ip });

		const { pageviews } = await waitFor(() => getRealtime(owner, organization), value => value.pageviews.total === 3);
		expect(pageviews.peak).toBe(2);
		expect(pageviews.points.at(-1)!.pageviews).toBe(2);
		const earlierMinute = pageviews.points.findIndex(point => point.pageviews > 0);
		expect(earlierMinute).toBeGreaterThanOrEqual(18);
		expect(earlierMinute).toBeLessThanOrEqual(20);
	});

	it("leaves out Visitors last seen more than 5 minutes ago and the Sites of other Organizations", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		const other = await newOrganization();
		const theirs = await createSiteAs(other.owner, other.organization);
		const goneId = (await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() })).headers.get("sd-visitor")!;
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await collect({ site_id: theirs.id, path: "/" }, { ip: uniqueIp() });
		await waitForLive(owner, organization, 2);
		await waitForLive(other.owner, other.organization, 1);
		await testDb.execute({ sql: "UPDATE visitors SET last_seen = last_seen - 301 WHERE id = ?", args: [goneId] });

		const realtime = await getRealtime(owner, organization);
		expect(realtime.count).toBe(1);
		expect(realtime.visitors.map(visitor => visitor.site.id)).toEqual([site.id]);
		expect(realtime.visitors.map(visitor => visitor.id)).not.toContain(goneId);
		expect(realtime.pageviews.total).toBe(2);
	});

	it("lets a Viewer read it and answers 404 to a stranger", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		const viewer = await addMember(owner, organization.id, "viewer");
		const stranger = await signUp("stranger");

		expect((await waitForLive(viewer, organization, 1)).visitors).toHaveLength(1);
		expect((await stranger.fetch(realtimePath(organization))).status).toBe(404);
	});
});

describe("GET /api/sites/:id/realtime", () => {
	it("covers one Site only", async () => {
		const { owner, organization } = await newOrganization();
		const site = await createSiteAs(owner, organization);
		const sibling = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/here" }, { ip: uniqueIp() });
		await collect({ site_id: sibling.id, path: "/there" }, { ip: uniqueIp() });
		await waitForLive(owner, organization, 2);

		const realtime = await owner.$fetch<Realtime>(`/api/sites/${site.id}/realtime`);
		expect(realtime.count).toBe(1);
		expect(realtime.visitors.map(visitor => visitor.path)).toEqual(["/here"]);
		expect(realtime.pageviews.total).toBe(1);
	});
});
