import { describe, expect, it } from "vitest";
import { safeRedirect } from "#layers/core/shared/utils/redirect";

describe("safeRedirect", () => {
	it("keeps a same-site path", () => {
		expect(safeRedirect("/app/acme?range=7d")).toBe("/app/acme?range=7d");
	});

	it("falls back for another origin", () => {
		expect(safeRedirect("https://evil.example.com")).toBe("/app");
		expect(safeRedirect("//evil.example.com")).toBe("/app");
		expect(safeRedirect("/\\evil.example.com")).toBe("/app");
	});

	it("falls back when missing", () => {
		expect(safeRedirect(undefined)).toBe("/app");
		expect(safeRedirect(["/a", "/b"])).toBe("/app");
	});
});
