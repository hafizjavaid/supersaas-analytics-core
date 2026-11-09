import { describe, expect, it } from "vitest";
import { filtersReportQuery, filterValueLabel } from "#layers/core/app/utils/dashboard-filters";

describe("filterValueLabel", () => {
	it("names a country", () => {
		expect(filterValueLabel({ dimension: "country", value: "PK" })).toBe("Pakistan");
	});

	it("names a region and a city with their country", () => {
		expect(filterValueLabel({ dimension: "region", value: "CH-BE" })).toBe("BE, Switzerland");
		expect(filterValueLabel({ dimension: "city", value: "US-San Francisco" })).toBe("San Francisco, United States");
	});

	it("capitalises a device type", () => {
		expect(filterValueLabel({ dimension: "device", value: "mobile" })).toBe("Mobile");
	});

	it("names a Channel, an AI assistant and direct traffic", () => {
		expect(filterValueLabel({ dimension: "channel", value: "ai" })).toBe("AI assistant");
		expect(filterValueLabel({ dimension: "ai_assistant", value: "chatgpt.com" })).toBe("ChatGPT");
		expect(filterValueLabel({ dimension: "referrer", value: "(direct)" })).toBe("Direct");
	});

	it("shows other values as they are", () => {
		expect(filterValueLabel({ dimension: "page", value: "/pricing" })).toBe("/pricing");
	});
});

describe("filtersReportQuery", () => {
	it("adds nothing without Filters", () => {
		expect(filtersReportQuery([])).toEqual({});
	});

	it("sends each Filter as a repeated f", () => {
		expect(filtersReportQuery([{ dimension: "country", value: "PK" }, { dimension: "browser", value: "Safari" }])).toEqual({ f: ["country:PK", "browser:Safari"] });
	});
});
