import { describe, expect, it } from "vitest";
import { describeError } from "#layers/core/app/utils/errors";

function fetchFailure(status: number, data: unknown) {
	return Object.assign(new Error("request failed"), { name: "FetchError", status, data });
}

describe("describeError", () => {
	it("shows the server message for a client error", () => {
		const caught = fetchFailure(409, { statusMessage: "Domain already exists", message: "A site for blog.example.com already exists." });
		expect(describeError(caught)).toBe("A site for blog.example.com already exists.");
	});

	it("names the field of each validation issue", () => {
		const caught = fetchFailure(400, {
			message: "Validation failed",
			data: { issues: [{ path: ["timezone"], message: "Unknown IANA timezone" }, { path: [], message: "Body is required" }] },
		});
		expect(describeError(caught)).toBe("Timezone: Unknown IANA timezone Body is required");
	});

	it("hides the raw message of a server error behind the fallback", () => {
		const caught = fetchFailure(500, { message: "D1_ERROR: UNIQUE constraint failed: sites.domain" });
		expect(describeError(caught, "Could not save")).toBe("Could not save");
	});

	it("explains a request that never reached the server", () => {
		const caught = Object.assign(new Error("fetch failed"), { name: "FetchError" });
		expect(describeError(caught)).toBe("Could not reach the server. Check your connection and try again.");
	});

	it("falls back for anything that is not a fetch error", () => {
		expect(describeError(undefined)).toBe("Something went wrong. Please try again.");
	});
});
