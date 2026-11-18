import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { collect, createOrganization, createSiteAs, postAs, serverUrl, signUp, timezoneAwayFromMidnight, uniqueIp, waitFor } from "./helpers";
import type { TestUser } from "./helpers";
import { run } from "../../cli/src/run.js";
import type { Io } from "../../cli/src/run.js";
import type { Funnel, Site } from "#layers/core/shared/types/analytics";
import type { CreatedApiKey } from "#layers/core/shared/types/api-keys";

await setupServer();

let owner: TestUser;
let site: Site;
let key: string;
let configDir: string;

async function supersaas(argv: string[], { env = {}, secret = key }: { env?: Record<string, string>; secret?: string } = {}) {
	let stdout = "";
	let stderr = "";
	const io: Io = {
		env,
		configDir,
		version: "0.0.0-test",
		fetch,
		stdout: (text) => {
			stdout += text;
		},
		stderr: (text) => {
			stderr += text;
		},
		readSecret: async () => secret,
	};
	const code = await run(argv, io);
	return { code, stdout, stderr };
}

function withKey(apiKey = key) {
	return { env: { SUPERSAAS_URL: serverUrl(), SUPERSAAS_API_KEY: apiKey } };
}

beforeAll(async () => {
	configDir = await mkdtemp(join(tmpdir(), "supersaas-cli-"));
	owner = await signUp("owner");
	const organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization, { name: "Docs", domain: "docs.example.com", timezone: timezoneAwayFromMidnight() });
	const created = await postAs(owner, `/api/organizations/${organization.id}/api-keys`, { name: "CLI" });
	key = (await created.json() as CreatedApiKey).key;

	const hit = { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } };
	await collect({ site_id: site.id, path: "/", referrer: "https://www.google.com/" }, hit);
	await collect({ site_id: site.id, path: "/pricing" }, hit);
	await postAs(owner, `/api/sites/${site.id}/funnels`, { name: "Pricing", window: "24h", steps: [{ kind: "page", value: "/", label: "Home" }, { kind: "page", value: "/pricing", label: "" }] });
	await waitFor(() => supersaas(["stats", site.id, "--range", "today", "--json"], withKey()), result => result.code === 0 && JSON.parse(result.stdout).current.pageviews === 2);
});

afterAll(async () => {
	await rm(configDir, { recursive: true, force: true });
});

describe("supersaas login", () => {
	it("checks the key against the server, then saves it with the URL", async () => {
		const result = await supersaas(["login", "--url", serverUrl()]);
		expect(result.code, result.stderr).toBe(0);
		expect(result.stdout).toContain("1 Site");
		const saved = JSON.parse(await readFile(join(configDir, "config.json"), "utf8"));
		expect(saved).toEqual({ url: serverUrl(), apiKey: key });

		const sites = await supersaas(["sites"]);
		expect(sites.code, sites.stderr).toBe(0);
		expect(sites.stdout).toContain("docs.example.com");
	});

	it("saves nothing when the server refuses the key", async () => {
		await rm(join(configDir, "config.json"), { force: true });
		const result = await supersaas(["login", "--url", serverUrl()], { secret: "ssa_0000000000000000000000000000000000000000" });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("API key was refused");
		await expect(readFile(join(configDir, "config.json"), "utf8")).rejects.toThrow();
	});
});

describe("reports", () => {
	it("finds a Site by its domain and prints the summary as a table", async () => {
		const result = await supersaas(["stats", "docs.example.com", "--range", "today"], withKey());
		expect(result.code, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/^Docs \(docs\.example\.com\), /);
		expect(result.stdout).toMatch(/Pageviews\s+2\s/);
	});

	it("prints the API v1 response with --json", async () => {
		const result = await supersaas(["top", site.id, "referrer", "--range", "today", "--json"], withKey());
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({ dimension: "referrer", rows: [{ label: "google.com", value: 1 }] });
	});

	it("narrows a report with Filters", async () => {
		const result = await supersaas(["stats", site.id, "--range", "today", "-f", "country:US", "--json"], withKey());
		expect(JSON.parse(result.stdout).current.pageviews).toBe(0);
	});

	it("reads a Funnel by its name", async () => {
		const result = await supersaas(["funnels", "docs.example.com", "pricing", "--range", "today", "--json"], withKey());
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({ funnel: { name: "Pricing" } as Partial<Funnel>, entered: 1, completed: 1 });
	});

	it("sums Live visitors across every Site without one", async () => {
		const result = await supersaas(["live", "--json"], withKey());
		expect(result.code, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({ visitors: 1, sites: [{ site: { id: site.id }, visitors: 1 }] });
	});

	it("prints the Tracking snippet for the server", async () => {
		const result = await supersaas(["snippet", "docs.example.com"], withKey());
		expect(result.stdout.trim()).toBe(`<script defer data-site="${site.id}" src="${serverUrl()}/sd.js"></script>`);
	});

	it("says which Site it could not find", async () => {
		const result = await supersaas(["goals", "unknown.example.com"], withKey());
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("unknown.example.com");
	});

	it("explains a revoked key", async () => {
		const result = await supersaas(["sites"], withKey("ssa_0000000000000000000000000000000000000000"));
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("API key was refused");
	});
});
