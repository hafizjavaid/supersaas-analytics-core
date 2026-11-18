import { describe, expect, it } from "vitest";
import { DIMENSIONS, RANGES } from "../../cli/src/arguments.js";
import { TOP_LIST_DIMENSIONS } from "#layers/core/shared/utils/ai";
import { RANGE_KEYS } from "#layers/core/shared/utils/dates";

describe("the CLI's copy of API v1's lists", () => {
	it("knows every Range API v1 reads", () => {
		expect(RANGES).toEqual(RANGE_KEYS);
	});

	it("knows every Dimension API v1 ranks", () => {
		expect(DIMENSIONS).toEqual(TOP_LIST_DIMENSIONS);
	});
});
