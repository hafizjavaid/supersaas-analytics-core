import { describe, expect, it } from "vitest";
import { describeHttpError } from "../src/errors.js";

const url = "https://supersaasanalytics.com";

describe("describeHttpError", () => {
	it("explains a refused key and how to replace it", () => {
		const message = describeHttpError({ status: 401, retryAfter: null, body: { statusMessage: "Invalid API key" }, url });
		expect(message).toContain("API key was refused");
		expect(message).toContain("supersaas login");
	});

	it("says when to retry after the rate limit", () => {
		expect(describeHttpError({ status: 429, retryAfter: "42", body: null, url })).toBe("Too many requests for this API key. Retry in 42 seconds.");
	});

	it("lists the server's reasons for a refused query", () => {
		const body = { statusMessage: "Validation failed", data: { issues: [{ message: "Unknown Filter: colour:red" }] } };
		expect(describeHttpError({ status: 400, retryAfter: null, body, url })).toBe("Validation failed: Unknown Filter: colour:red");
	});

	it("passes on the server's message otherwise", () => {
		expect(describeHttpError({ status: 404, retryAfter: null, body: { statusMessage: "Funnel not found" }, url })).toBe("Funnel not found");
		expect(describeHttpError({ status: 502, retryAfter: null, body: null, url })).toBe(`${url} answered 502.`);
	});
});
