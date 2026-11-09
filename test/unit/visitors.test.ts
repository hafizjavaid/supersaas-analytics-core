import { describe, expect, it } from "vitest";
import { countryCodesMatching, countryName } from "#layers/core/shared/utils/countries";
import { labelSearchTerm, visitorLabel, visitorNumber } from "#layers/core/shared/utils/visitors";

describe("visitorNumber", () => {
	it("turns the first six hex characters into six digits", () => {
		expect(visitorNumber("083047ffffffffff")).toBe("083047");
		expect(visitorNumber("abcdef0123456789")).toBe("012345");
		expect(visitorNumber("ABCDEF")).toBe("012345");
	});
});

describe("visitorLabel", () => {
	it("names an anonymous Visitor by its number", () => {
		expect(visitorLabel("0830479a")).toBe("Visitor 083047");
	});
});

describe("labelSearchTerm", () => {
	it("drops a leading 'visitor' so a pasted label still matches", () => {
		expect(labelSearchTerm("Visitor 083047")).toBe("083047");
		expect(labelSearchTerm("visitor083")).toBe("083");
	});

	it("matches only digits", () => {
		expect(labelSearchTerm("0830")).toBe("0830");
		expect(labelSearchTerm("/pricing")).toBeNull();
		expect(labelSearchTerm("visitor")).toBeNull();
	});
});

describe("countryCodesMatching", () => {
	const codes = ["US", "GB", "PK", "DE"];

	it("matches a code exactly and a name in part, ignoring case", () => {
		expect(countryCodesMatching(codes, "us")).toEqual(["US"]);
		expect(countryCodesMatching(codes, "pakis")).toEqual(["PK"]);
		expect(countryCodesMatching(codes, "united")).toEqual(["US", "GB"]);
	});

	it("matches nothing for an unrelated term", () => {
		expect(countryCodesMatching(codes, "/pricing")).toEqual([]);
	});
});

describe("countryName", () => {
	it("falls back to the code it cannot name", () => {
		expect(countryName("DE")).toBe("Germany");
		expect(countryName("not-a-code")).toBe("not-a-code");
	});
});
