import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { anonymousFetch, collect, createOrganization, createSiteAs, postAs, signUp, timezoneAwayFromMidnight, uniqueIp, waitFor } from "./helpers";
import type { TestUser } from "./helpers";
import { callMcpTool, MCP_INITIALIZE_PARAMS, mcpRequest, postMcp, toolJson } from "./mcp";
import { TEST_SITE_POLAR_TOKEN } from "./polar";
import type { ApiV1Funnels, ApiV1Live, ApiV1Sites, ApiV1Summary, ApiV1TopList } from "#layers/core/shared/schemas/api-v1";
import type { Site } from "#layers/core/shared/types/analytics";
import type { CreatedApiKey } from "#layers/core/shared/types/api-keys";

await setupServer();

let owner: TestUser;
let site: Site;
let key: string;
let otherSite: Site;

async function createKey(user: TestUser, organizationId: string) {
	const response = await postAs(user, `/api/organizations/${organizationId}/api-keys`, { name: "Agent" });
	expect(response.status).toBe(201);
	return (await response.json() as CreatedApiKey).key;
}

async function listToolNames(apiKey: string) {
	const response = await mcpRequest<{ tools: { name: string }[] }>(apiKey, "tools/list");
	return response.result!.tools.map(tool => tool.name);
}

// One visitor from CH reads / then /pricing; one from US reads /blog.
beforeAll(async () => {
	owner = await signUp("owner");
	const organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization, { name: "Docs", domain: "docs.example.com", timezone: timezoneAwayFromMidnight() });
	key = await createKey(owner, organization.id);

	const swiss = { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } };
	await collect({ site_id: site.id, path: "/" }, swiss);
	await collect({ site_id: site.id, path: "/pricing" }, swiss);
	await collect({ site_id: site.id, path: "/blog" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "US" } });
	await waitFor(
		() => anonymousFetch(`/api/v1/sites/${site.id}/summary?range=today`, { headers: { authorization: `Bearer ${key}` } }).then(response => response.json() as Promise<ApiV1Summary>),
		summary => summary.current.pageviews === 3,
	);

	const stranger = await signUp("stranger");
	otherSite = await createSiteAs(stranger, await createOrganization(stranger));
});

describe("authentication", () => {
	it("answers 401 before the handshake without a valid key", async () => {
		const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: MCP_INITIALIZE_PARAMS };
		const withoutKey = await postMcp(initialize, null);
		expect(withoutKey.status).toBe(401);
		expect(withoutKey.headers.get("www-authenticate")).toBe("Bearer");
		expect((await postMcp(initialize, "ssa_0000000000000000000000000000000000000000")).status).toBe(401);
	});
});

describe("the handshake", () => {
	it("initializes with the server's name and instructions", async () => {
		const response = await mcpRequest<{ serverInfo: { name: string }; capabilities: { tools?: unknown }; instructions: string }>(key, "initialize", MCP_INITIALIZE_PARAMS);
		expect(response.result?.serverInfo.name).toBe("supersaas-analytics");
		expect(response.result?.capabilities.tools).toBeDefined();
		expect(response.result?.instructions).toContain("A Range is");
	});

	it("lists API v1's reports as tools, without payments while no Site has a Revenue connection", async () => {
		expect(await listToolNames(key)).toEqual(["list_sites", "summary", "timeseries", "top_list", "goals", "funnels", "funnel", "live"]);
	});

	it("describes what a Range, Filter and Dimension are", async () => {
		const response = await mcpRequest<{ tools: { name: string; description: string; inputSchema: { properties: Record<string, { description?: string }> } }[] }>(key, "tools/list");
		const topList = response.result!.tools.find(tool => tool.name === "top_list")!;
		expect(topList.description).toContain("Range");
		expect(topList.inputSchema.properties.range!.description).toContain("custom with from and to");
		expect(topList.inputSchema.properties.filters!.description).toContain("dimension:value");
		expect(topList.inputSchema.properties.dimension!.description).toContain("Dimension");
	});

	it("titles every tool and marks it read-only, as directory reviewers require", async () => {
		const response = await mcpRequest<{ tools: { title?: string; annotations?: { title?: string; readOnlyHint?: boolean; openWorldHint?: boolean } }[] }>(key, "tools/list");
		for (const tool of response.result!.tools) {
			expect(tool.title).toBeTruthy();
			expect(tool.annotations).toEqual({ title: tool.title, readOnlyHint: true, openWorldHint: false });
		}
	});
});

describe("calling tools", () => {
	it("lists the key's Organization's Sites", async () => {
		const sites = toolJson<ApiV1Sites>(await callMcpTool(key, "list_sites"));
		expect(sites.sites.map(listed => listed.id)).toEqual([site.id]);
	});

	it("answers summary in API v1's shape", async () => {
		const result = await callMcpTool(key, "summary", { siteId: site.id, range: "today" });
		expect(result.isError).toBeFalsy();
		const summary = toolJson<ApiV1Summary>(result);
		expect(summary).toMatchObject({
			site: { id: site.id, name: "Docs", domain: "docs.example.com" },
			current: { visitors: 2, visits: 2, pageviews: 3 },
			previous: { pageviews: 0 },
		});
		expect(result.structuredContent).toEqual(summary);
	});

	it("narrows a report to its Filters", async () => {
		const summary = toolJson<ApiV1Summary>(await callMcpTool(key, "summary", { siteId: site.id, range: "today", filters: ["country:CH"] }));
		expect(summary.current.pageviews).toBe(2);
	});

	it("ranks a Dimension", async () => {
		const pages = toolJson<ApiV1TopList>(await callMcpTool(key, "top_list", { siteId: site.id, range: "today", dimension: "page" }));
		expect(pages.rows.map(row => row.label).sort()).toEqual(["/", "/blog", "/pricing"]);
	});

	it("reads Live visitors and Funnels", async () => {
		expect(toolJson<ApiV1Live>(await callMcpTool(key, "live", { siteId: site.id })).visitors).toBe(2);
		expect(toolJson<ApiV1Funnels>(await callMcpTool(key, "funnels", { siteId: site.id })).funnels).toEqual([]);
	});

	it("answers another Organization's Site as a tool error the agent can read", async () => {
		const result = await callMcpTool(key, "summary", { siteId: otherSite.id });
		expect(result.isError).toBe(true);
		expect(result.content[0]!.text).toContain("Site not found");
	});

	it("refuses a custom Range without from and to, and an unreadable Filter", async () => {
		expect((await callMcpTool(key, "summary", { siteId: site.id, range: "custom", from: "2024-01-01" })).isError).toBe(true);
		const badFilter = await mcpRequest<{ isError?: boolean }>(key, "tools/call", { name: "summary", arguments: { siteId: site.id, filters: ["planet:Mars"] } });
		expect(badFilter.error ?? badFilter.result?.isError).toBeTruthy();
	});
});

describe("payments", () => {
	it("is listed once a Site has a Revenue connection", async () => {
		const response = await owner.fetch(`/api/sites/${site.id}/revenue`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ provider: "polar", environment: "sandbox", accessToken: TEST_SITE_POLAR_TOKEN, currency: "usd" }),
		});
		expect(response.status).toBe(200);

		expect(await listToolNames(key)).toContain("payments");
		const payments = await callMcpTool(key, "payments", { siteId: site.id, range: "today" });
		expect(toolJson<{ currency: string; current: { payments: number } }>(payments)).toMatchObject({ currency: "usd", current: { payments: 0 } });
	});
});
