import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { anonymousFetch } from "./helpers";

await setupServer();

async function page(path: string) {
	const response = await anonymousFetch(path, { redirect: "manual" });
	return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}

describe("core without the marketing site", () => {
	it("sends / to the app, through sign-in when signed out", async () => {
		const { status, location } = await page("/");

		expect(status).toBe(302);
		expect(location).toBe("/auth/login?redirect=/app");
	});

	it.each(["/pricing", "/blog", "/docs", "/docs/getting-started/installation", "/privacy", "/terms", "/sitemap.xml"])("has no %s", async (path) => {
		expect((await page(path)).status).toBe(404);
	});

	it("has no Nuxt Content queries", async () => {
		const response = await anonymousFetch("/__nuxt_content/docs/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT 1" }) });
		expect(response.status).toBe(404);
	});

	it("keeps every crawler out", async () => {
		const { status, body } = await page("/robots.txt");

		expect(status).toBe(200);
		expect(body).toBe("User-agent: *\nDisallow: /\n");
	});
});
