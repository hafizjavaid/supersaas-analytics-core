import { describe, expect, it } from "vitest";
import { parseFilter, parseFilters, parsePlace, serializeFilter, withFilter, withoutFilter } from "#layers/core/shared/utils/filters";

describe("parseFilter", () => {
	it("reads dimension:value", () => {
		expect(parseFilter("country:PK")).toEqual({ dimension: "country", value: "PK" });
	});

	it("keeps colons inside the value", () => {
		expect(parseFilter("page:/docs/a:b")).toEqual({ dimension: "page", value: "/docs/a:b" });
	});

	it.each([
		["an unknown dimension", "colour:red"],
		["an empty value", "country:"],
		["no separator", "country"],
		["no dimension", ":PK"],
		["a region without its country", "region:BE"],
		["a city without its country", "city:Bern"],
		["an unknown Channel", "channel:AI assistant"],
		["an unknown AI assistant", "ai_assistant:example.com"],
		["a value over 512 characters", `page:/${"a".repeat(512)}`],
		["a non-string", 42],
	])("rejects %s", (_, raw) => {
		expect(parseFilter(raw)).toBeNull();
	});

	it("accepts a region and a city prefixed with the country", () => {
		expect(parseFilter("region:CH-BE")).toEqual({ dimension: "region", value: "CH-BE" });
		expect(parseFilter("city:US-San Francisco")).toEqual({ dimension: "city", value: "US-San Francisco" });
	});

	it("accepts a Channel key and an AI assistant's domain", () => {
		expect(parseFilter("channel:ai")).toEqual({ dimension: "channel", value: "ai" });
		expect(parseFilter("ai_assistant:chatgpt.com")).toEqual({ dimension: "ai_assistant", value: "chatgpt.com" });
	});
});

describe("parseFilters", () => {
	it("reads one value or many", () => {
		expect(parseFilters("browser:Safari")).toEqual([{ dimension: "browser", value: "Safari" }]);
		expect(parseFilters(["country:PK", "browser:Safari"])).toEqual([
			{ dimension: "country", value: "PK" },
			{ dimension: "browser", value: "Safari" },
		]);
	});

	it("is empty without a query value", () => {
		expect(parseFilters(undefined)).toEqual([]);
	});

	it("drops invalid entries", () => {
		expect(parseFilters(["nonsense", "os:iOS"])).toEqual([{ dimension: "os", value: "iOS" }]);
	});

	it("keeps the last value of a Dimension filtered twice", () => {
		expect(parseFilters(["country:PK", "os:iOS", "country:US"])).toEqual([
			{ dimension: "country", value: "US" },
			{ dimension: "os", value: "iOS" },
		]);
	});
});

describe("filter lists", () => {
	const filters = [{ dimension: "country", value: "PK" }, { dimension: "os", value: "iOS" }] as const;

	it("adds a filter for a new Dimension at the end", () => {
		expect(withFilter([...filters], { dimension: "event", value: "signup" })).toHaveLength(3);
	});

	it("replaces the filter of the same Dimension in place", () => {
		expect(withFilter([...filters], { dimension: "country", value: "US" })[0]).toEqual({ dimension: "country", value: "US" });
	});

	it("removes a Dimension", () => {
		expect(withoutFilter([...filters], "country")).toEqual([{ dimension: "os", value: "iOS" }]);
	});

	it("serializes back to dimension:value", () => {
		expect(serializeFilter({ dimension: "page", value: "/a:b" })).toBe("page:/a:b");
		expect(parseFilter(serializeFilter({ dimension: "page", value: "/a:b" }))).toEqual({ dimension: "page", value: "/a:b" });
	});

	it("splits a place into country and name", () => {
		expect(parsePlace("US-San Francisco")).toEqual({ country: "US", name: "San Francisco" });
		expect(parsePlace("Bern")).toBeNull();
	});
});
