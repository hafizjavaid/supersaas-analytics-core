import { describe, expect, it } from "vitest";
import { nextPageStatsOrder, pageUrl, sparklinePoints } from "#layers/core/app/utils/page-stats";

describe("nextPageStatsOrder", () => {
	it("flips the order of the sorted column", () => {
		expect(nextPageStatsOrder({ sort: "views", order: "desc" }, "views")).toEqual({ sort: "views", order: "asc" });
		expect(nextPageStatsOrder({ sort: "views", order: "asc" }, "views")).toEqual({ sort: "views", order: "desc" });
	});

	it("starts pages A to Z and numbers highest first", () => {
		expect(nextPageStatsOrder({ sort: "views", order: "desc" }, "page")).toEqual({ sort: "page", order: "asc" });
		expect(nextPageStatsOrder({ sort: "page", order: "asc" }, "bounce")).toEqual({ sort: "bounce", order: "desc" });
	});
});

describe("pageUrl", () => {
	it("joins the Site's domain and the path", () => {
		expect(pageUrl("example.com", "/pricing")).toBe("https://example.com/pricing");
	});
});

describe("sparklinePoints", () => {
	it("scales values to the box with zero at the bottom", () => {
		expect(sparklinePoints([0, 2, 4], 100, 20)).toBe("0,20 50,10 100,0");
	});

	it("draws a flat line along the bottom for no views", () => {
		expect(sparklinePoints([0, 0], 10, 5)).toBe("0,5 10,5");
	});

	it("draws nothing without values", () => {
		expect(sparklinePoints([], 10, 5)).toBe("");
	});
});
