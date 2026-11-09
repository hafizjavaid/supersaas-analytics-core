import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Hit } from "./helpers";
import type { Journeys, Site } from "#layers/core/shared/types/analytics";

await setupServer();

const DAY = 86_400;

function journeys(siteId: string, path: string[] = [], query = "range=today", filters: string[] = []) {
	const params = [query, ...path.map(node => `path=${encodeURIComponent(node)}`), ...filters.map(filter => `f=${encodeURIComponent(filter)}`)];
	return $fetch<Journeys>(`/api/sites/${siteId}/journeys?${params.join("&")}`);
}

function startingPoints(report: Journeys) {
	return report.startingPoints.map(group => [group.segment, group.visitors, group.nodes.map(node => [node.path, node.visitors])]);
}

function column(report: Journeys, step: number) {
	const found = report.steps.find(candidate => candidate.step === step)!;
	return { visitors: found.visitors, exits: found.exits, nodes: found.nodes.map(node => [node.path, node.visitors, node.selected]) };
}

let site: Site;

// alice: / -> /pricing (cta_click) -> /signup (signup)
// bob:   / -> /pricing (cta_click)
// carol: / -> /blog/launch -> /pricing (cta_click)
// dave:  /
// erin:  /blog/launch -> /blog/tips
// frank: /pricing -> /pricing (a reload) -> /signup
// hank:  /old, yesterday
async function arrangeSite() {
	site = await createSite({ timezone: timezoneAwayFromMidnight() });
	const people = Object.fromEntries(["alice", "bob", "carol", "dave", "erin", "frank", "hank"].map(name => [name, { ip: uniqueIp() } satisfies Hit]));
	let pageviews = 0;
	const view = async (who: Hit, path: string) => {
		const response = await collect({ site_id: site.id, path }, who);
		pageviews += 1;
		await waitForPageviews(site.id, pageviews);
		return response.headers.get("sd-visitor")!;
	};
	const fire = (who: Hit, name: string, path: string) => collect({ site_id: site.id, name, path }, who);

	await view(people.alice!, "/");
	await view(people.alice!, "/pricing");
	await fire(people.alice!, "cta_click", "/pricing");
	await view(people.alice!, "/signup");
	await fire(people.alice!, "signup", "/signup");
	await view(people.bob!, "/");
	await view(people.bob!, "/pricing");
	await fire(people.bob!, "cta_click", "/pricing");
	await view(people.carol!, "/");
	await view(people.carol!, "/blog/launch");
	await view(people.carol!, "/pricing");
	await fire(people.carol!, "cta_click", "/pricing");
	await view(people.dave!, "/");
	await view(people.erin!, "/blog/launch");
	await view(people.erin!, "/blog/tips");
	await view(people.frank!, "/pricing");
	await view(people.frank!, "/pricing");
	await view(people.frank!, "/signup");
	const hankId = await view(people.hank!, "/old");

	await testDb.batch([
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE visit_id IN (SELECT id FROM visits WHERE visitor_id = ?)", args: [DAY, hankId] },
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE visitor_id = ?", args: [DAY, DAY, hankId] },
	]);
	await waitFor(() => journeys(site.id, ["/"], "range=7d"), report => report.visitors === 7 && report.steps.length === 1);
	await waitFor(() => journeys(site.id, ["/", "/pricing"]), report => report.events?.rows[0]?.count === 2);
}

beforeAll(arrangeSite);

describe("Journeys", () => {
	it("groups the starting points by their first path segment", async () => {
		const report = await journeys(site.id);
		expect(report.visitors).toBe(6);
		expect(report.path).toEqual([]);
		expect(report.steps).toEqual([]);
		expect(report.events).toBeNull();
		expect(startingPoints(report)).toEqual([
			["/", 4, [["/", 4]]],
			["/blog", 1, [["/blog/launch", 1]]],
			["/pricing", 1, [["/pricing", 1]]],
		]);
	});

	it("counts the next step of the Visitors who started on the selected node, and those who left", async () => {
		const report = await journeys(site.id, ["/"]);
		expect(report.startingPoints[0]).toMatchObject({ segment: "/", selected: true, nodes: [{ path: "/", selected: true }] });
		expect(report.steps).toHaveLength(1);
		expect(column(report, 1)).toEqual({ visitors: 4, exits: 1, nodes: [["/pricing", 2, false], ["/blog/launch", 1, false]] });
	});

	it("follows the selected nodes step by step", async () => {
		const report = await journeys(site.id, ["/", "/pricing"]);
		expect(column(report, 1)).toEqual({ visitors: 4, exits: 1, nodes: [["/pricing", 2, true], ["/blog/launch", 1, false]] });
		expect(column(report, 2)).toEqual({ visitors: 2, exits: 1, nodes: [["/signup", 1, false]] });

		const deeper = await journeys(site.id, ["/", "/blog/launch", "/pricing"]);
		expect(column(deeper, 2)).toEqual({ visitors: 1, exits: 0, nodes: [["/pricing", 1, true]] });
		expect(column(deeper, 3)).toEqual({ visitors: 1, exits: 1, nodes: [] });
	});

	it("does not count a reload of the same page as a step", async () => {
		const report = await journeys(site.id, ["/pricing"]);
		expect(column(report, 1)).toEqual({ visitors: 1, exits: 0, nodes: [["/signup", 1, false]] });
	});

	it("lists the Events fired on the last selected node", async () => {
		const report = await journeys(site.id, ["/", "/pricing"]);
		expect(report.events).toEqual({ path: "/pricing", rows: [{ name: "cta_click", count: 2, visitors: 2 }] });

		const signup = await journeys(site.id, ["/", "/pricing", "/signup"]);
		expect(signup.events).toEqual({ path: "/signup", rows: [{ name: "signup", count: 1, visitors: 1 }] });
		expect((await journeys(site.id, ["/"])).events).toEqual({ path: "/", rows: [] });
	});

	it("keeps a selected node that no Visitor reached", async () => {
		const report = await journeys(site.id, ["/", "/missing"]);
		expect(column(report, 1).nodes).toContainEqual(["/missing", 0, true]);
		expect(column(report, 2)).toEqual({ visitors: 0, exits: 0, nodes: [] });
	});

	it("reads only the Visits that start in the Range", async () => {
		const week = await journeys(site.id, [], "range=7d");
		expect(week.visitors).toBe(7);
		expect(startingPoints(week)).toContainEqual(["/old", 1, [["/old", 1]]]);
		expect(startingPoints(await journeys(site.id, [], "range=yesterday"))).toEqual([["/old", 1, [["/old", 1]]]]);
	});

	it("respects the Filters", async () => {
		const report = await journeys(site.id, ["/"], "range=today", ["page:/blog/launch"]);
		expect(report.visitors).toBe(2);
		expect(startingPoints(report)).toEqual([["/", 1, [["/", 1]]], ["/blog", 1, [["/blog/launch", 1]]]]);
		expect(column(report, 1)).toEqual({ visitors: 1, exits: 0, nodes: [["/blog/launch", 1, false]] });
	});

	it("answers an empty explorer for a Site without traffic", async () => {
		const empty = await createSite();
		expect(await journeys(empty.id, ["/"])).toMatchObject({ visitors: 0, startingPoints: [{ segment: "/", visitors: 0, nodes: [{ path: "/", visitors: 0, selected: true }] }], steps: [{ step: 1, visitors: 0, exits: 0, nodes: [] }] });
	});
});
