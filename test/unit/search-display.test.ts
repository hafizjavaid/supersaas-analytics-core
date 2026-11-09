import { describe, expect, it } from "vitest";
import { formatPosition, positionChange, searchSummaryTiles } from "#layers/core/app/utils/search";

describe("searchSummaryTiles", () => {
	it("shows clicks, impressions, CTR and position with their change", () => {
		const tiles = searchSummaryTiles({
			clicks: 120,
			impressions: 4000,
			position: 8.2,
			previous: { clicks: 100, impressions: 4000, position: 9.5 },
		});
		expect(tiles.map(tile => [tile.label, tile.value])).toEqual([
			["Clicks", "120"],
			["Impressions", "4K"],
			["CTR", "3.0%"],
			["Avg. position", "8.2"],
		]);
		expect(tiles[0]!.change).toEqual({ label: "+20%", tone: "success" });
		expect(tiles[3]!.change).toEqual({ label: "−1.3", tone: "success" });
	});

	it("leaves out changes there is nothing to compare with", () => {
		const tiles = searchSummaryTiles({ clicks: 5, impressions: 50, position: null, previous: { clicks: 0, impressions: 0, position: null } });
		expect(tiles[0]!.change).toBeNull();
		expect(tiles[3]).toMatchObject({ value: "–", change: null });
	});
});

describe("positionChange", () => {
	it("counts a lower position as better", () => {
		expect(positionChange(4, 6)).toEqual({ label: "−2.0", tone: "success" });
		expect(positionChange(6, 4)).toEqual({ label: "+2.0", tone: "error" });
		expect(positionChange(4, 4)).toEqual({ label: "0", tone: "neutral" });
	});
});

describe("formatPosition", () => {
	it("keeps one decimal", () => {
		expect(formatPosition(3.14)).toBe("3.1");
		expect(formatPosition(null)).toBe("–");
	});
});
