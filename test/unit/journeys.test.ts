import { describe, expect, it } from "vitest";
import { firstSegment, groupStartingPoints, journeyStartOfFunnel, MAX_JOURNEY_DEPTH, parseJourneyPath, topJourneyNodes } from "#layers/core/shared/utils/journeys";

const node = (path: string, visitors: number, selected = false) => ({ path, visitors, selected });

describe("parseJourneyPath", () => {
	it("reads one or several selected nodes in order", () => {
		expect(parseJourneyPath("/pricing")).toEqual(["/pricing"]);
		expect(parseJourneyPath(["/", "/pricing", "/signup"])).toEqual(["/", "/pricing", "/signup"]);
		expect(parseJourneyPath(undefined)).toEqual([]);
	});

	it("cuts the chain at the first invalid node and at the deepest step", () => {
		expect(parseJourneyPath(["/", "", "/signup"])).toEqual(["/"]);
		expect(parseJourneyPath(["/", "x".repeat(2049)])).toEqual(["/"]);
		expect(parseJourneyPath(Array.from({ length: 20 }, (_, index) => `/${index}`))).toHaveLength(MAX_JOURNEY_DEPTH);
	});
});

describe("firstSegment", () => {
	it("keeps the first path segment", () => {
		expect(firstSegment("/")).toBe("/");
		expect(firstSegment("/pricing")).toBe("/pricing");
		expect(firstSegment("/blog/launch/part-2")).toBe("/blog");
		expect(firstSegment("/blog/")).toBe("/blog");
	});
});

describe("groupStartingPoints", () => {
	it("groups starting points by their first segment, largest first", () => {
		expect(groupStartingPoints([node("/blog/a", 2), node("/", 5), node("/blog/b", 4, true), node("/blog", 1)])).toEqual([
			{ segment: "/blog", visitors: 7, selected: true, nodes: [node("/blog/b", 4, true), node("/blog/a", 2), node("/blog", 1)] },
			{ segment: "/", visitors: 5, selected: false, nodes: [node("/", 5)] },
		]);
	});

	it("breaks ties by name", () => {
		expect(groupStartingPoints([node("/b", 1), node("/a", 1)]).map(group => group.segment)).toEqual(["/a", "/b"]);
	});
});

describe("topJourneyNodes", () => {
	it("keeps the busiest nodes and always the selected one", () => {
		const nodes = [node("/a", 9), node("/b", 8), node("/c", 7), node("/d", 1, true)];
		expect(topJourneyNodes(nodes, 2)).toEqual([node("/a", 9), node("/b", 8), node("/d", 1, true)]);
		expect(topJourneyNodes(nodes, 10)).toHaveLength(4);
	});
});

describe("journeyStartOfFunnel", () => {
	it("starts at a Funnel's first page when it is one exact path", () => {
		expect(journeyStartOfFunnel([{ kind: "page", value: "/pricing", label: "" }])).toEqual(["/pricing"]);
		expect(journeyStartOfFunnel([{ kind: "page", value: "/docs*", label: "" }])).toEqual([]);
		expect(journeyStartOfFunnel([{ kind: "event", value: "signup", label: "" }])).toEqual([]);
	});
});
