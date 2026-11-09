import { describe, expect, it } from "vitest";
import { journeyColumnTitle, journeyQuery, journeyShare, selectJourneyNode } from "#layers/core/app/utils/journeys";

describe("journeyColumnTitle", () => {
	it("names the starting point and each step after it", () => {
		expect(journeyColumnTitle(0)).toBe("Starting point");
		expect(journeyColumnTitle(1)).toBe("1 step after");
		expect(journeyColumnTitle(3)).toBe("3 steps after");
	});
});

describe("selectJourneyNode", () => {
	it("replaces the selection from the clicked column on", () => {
		expect(selectJourneyNode([], 0, "/")).toEqual(["/"]);
		expect(selectJourneyNode(["/", "/pricing", "/signup"], 1, "/blog")).toEqual(["/", "/blog"]);
		expect(selectJourneyNode(["/"], 1, "/pricing")).toEqual(["/", "/pricing"]);
	});

	it("unselects a selected node and everything after it", () => {
		expect(selectJourneyNode(["/", "/pricing", "/signup"], 1, "/pricing")).toEqual(["/"]);
		expect(selectJourneyNode(["/"], 0, "/")).toEqual([]);
	});
});

describe("journeyShare", () => {
	it("rounds the share of a column to a whole percent", () => {
		expect(journeyShare(1, 3)).toBe("33%");
		expect(journeyShare(0, 0)).toBe("0%");
	});
});

describe("journeyQuery", () => {
	it("keeps the Range and Filters and starts at the given path", () => {
		expect(journeyQuery({ range: "7d", f: ["country:PK"] }, ["/pricing"])).toEqual({ range: "7d", f: ["country:PK"], path: ["/pricing"] });
		expect(journeyQuery({ range: "7d" }, [])).toEqual({ range: "7d" });
	});
});
