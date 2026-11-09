import { describe, expect, it } from "vitest";
import { placeLabel, realtimeChipGroups } from "#layers/core/app/utils/realtime";

describe("realtimeChipGroups", () => {
	it("labels direct traffic, countries by name and device types", () => {
		const groups = realtimeChipGroups({
			referrers: [{ value: "(direct)", count: 2 }, { value: "google.com", count: 1 }],
			countries: [{ value: "CH", count: 3 }],
			devices: [{ value: "mobile", count: 3 }],
		});
		expect(groups.map(group => [group.label, group.chips.map(chip => `${chip.label} ${chip.count}`)])).toEqual([
			["Referrers", ["Direct 2", "google.com 1"]],
			["Countries", ["Switzerland 3"]],
			["Devices", ["Mobile 3"]],
		]);
	});
});

describe("placeLabel", () => {
	it("names the city with its country, or only the country", () => {
		expect(placeLabel({ country: "CH", region: "BE", city: "Bern" })).toBe("Bern, Switzerland");
		expect(placeLabel({ country: "JP", region: null, city: null })).toBe("Japan");
		expect(placeLabel(null)).toBe("Unknown location");
	});
});
