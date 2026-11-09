import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, testDb, uniqueIp, waitFor } from "./helpers";
import type { LiveVisitors } from "#layers/core/shared/types/analytics";

await setupServer();

function getLive(siteId: string) {
	return $fetch<LiveVisitors>(`/api/sites/${siteId}/live`);
}

const ZURICH = { "x-vercel-ip-latitude": "47.37", "x-vercel-ip-longitude": "8.54" };
const TOKYO = { "x-vercel-ip-latitude": "35.68", "x-vercel-ip-longitude": "139.69" };

describe("GET /api/sites/:id/live", () => {
	it("counts a Visitor with a fresh Pageview as live and groups them by coordinates", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: ZURICH });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: ZURICH });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: TOKYO });
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });

		const live = await waitFor(() => getLive(site.id), value => value.count === 4);
		expect(live).toEqual({
			count: 4,
			locations: [
				{ latitude: 47.37, longitude: 8.54, count: 2 },
				{ latitude: 35.68, longitude: 139.69, count: 1 },
			],
		});
	});

	it("does not count a Visitor last seen more than 5 minutes ago", async () => {
		const site = await createSite();
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp(), headers: ZURICH });
		await waitFor(() => getLive(site.id), value => value.count === 1);
		await testDb.execute({ sql: "UPDATE visitors SET last_seen = last_seen - 301 WHERE site_id = ?", args: [site.id] });

		expect(await getLive(site.id)).toEqual({ count: 0, locations: [] });
	});

	it("returns 404 for an unknown Site", async () => {
		expect((await fetch("/api/sites/unknown-site/live")).status).toBe(404);
	});
});
