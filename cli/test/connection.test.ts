import { describe, expect, it } from "vitest";
import { DEFAULT_URL, resolveConnection } from "../src/connection.js";

const saved = { url: "https://supersaasanalytics.com", apiKey: "ssa_saved" };

describe("resolveConnection", () => {
	it("uses the saved key and URL", () => {
		expect(resolveConnection({ env: {}, config: saved })).toEqual({ ok: true, url: "https://supersaasanalytics.com", apiKey: "ssa_saved" });
	});

	it("lets SUPERSAAS_API_KEY and SUPERSAAS_URL override the saved ones", () => {
		expect(resolveConnection({ env: { SUPERSAAS_API_KEY: "ssa_env", SUPERSAAS_URL: "https://stats.example.com/" }, config: saved }))
			.toEqual({ ok: true, url: "https://stats.example.com", apiKey: "ssa_env" });
	});

	it("lets --url win over SUPERSAAS_URL", () => {
		expect(resolveConnection({ flagUrl: "http://localhost:3002", env: { SUPERSAAS_API_KEY: "ssa_env", SUPERSAAS_URL: "https://stats.example.com" } }))
			.toMatchObject({ url: "http://localhost:3002" });
	});

	it("defaults to the Hosted site", () => {
		expect(resolveConnection({ env: { SUPERSAAS_API_KEY: "ssa_env" } })).toMatchObject({ url: DEFAULT_URL });
	});

	it("never sends the saved key to another server", () => {
		const resolved = resolveConnection({ flagUrl: "https://stats.example.com", env: {}, config: saved });
		expect(resolved).toEqual({ ok: false, error: expect.stringContaining("supersaas login --url https://stats.example.com") });
	});

	it("asks to log in without any key", () => {
		expect(resolveConnection({ env: {} })).toEqual({ ok: false, error: expect.stringContaining("supersaas login") });
	});

	it("refuses a URL that is not http or https", () => {
		expect(resolveConnection({ flagUrl: "stats.example.com", env: {}, config: saved })).toEqual({ ok: false, error: expect.stringContaining("http") });
	});
});
