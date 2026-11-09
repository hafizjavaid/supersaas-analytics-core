import { spawn, spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import type { TestProject } from "vitest/node";
import { newCredentials, signUpVerified } from "./accounts";
import { startFakePolar } from "./fake-polar";
import { startFakeAnthropic } from "./fake-anthropic";
import { startFakeSearch } from "./fake-search";
import { startFakeStripe } from "./fake-stripe";
import { FAKE_POLAR_URL } from "./polar";
import { FAKE_ANTHROPIC_URL, TEST_ANTHROPIC_KEY } from "./anthropic";
import { FAKE_GOOGLE_OAUTH_URL, FAKE_SEARCH_URL, TEST_GOOGLE_CLIENT_ID } from "./search";
import { FAKE_STRIPE_URL } from "./stripe";
import type { Credentials } from "./accounts";

const READY_TIMEOUT_MS = 180_000;

// NuxtHub writes the database client, with its URL baked in, to this one file for every Nuxt process of the app.
// It is restored after the run so a `pnpm dev` that reloads later does not end up on the test database.
const HUB_DB_CLIENT = "node_modules/@nuxthub/db/db.mjs";

declare module "vitest" {
	export interface ProvidedContext {
		serverUrl: string;
		firstUser: Credentials;
	}
}

export interface TestServerOptions {
	port: number;
	env?: Record<string, string>;
}

async function waitUntilReady(baseUrl: string, isAlive: () => boolean) {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!isAlive()) {
			throw new Error("The test dev server exited before it was ready");
		}
		try {
			const response = await fetch(`${baseUrl}/api/organizations`, { signal: AbortSignal.timeout(30_000) });
			if (response.status !== 503) {
				return;
			}
		}
		catch {
			// Not listening yet.
		}
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	throw new Error(`The test dev server was not ready after ${READY_TIMEOUT_MS}ms`);
}

async function removeTestData() {
	try {
		await rm(".data/test", { recursive: true, force: true });
	}
	catch (error) {
		throw new Error("Could not reset .data/test. A running `pnpm dev` may have picked up the test database; restart it and run the tests again.", { cause: error });
	}
}

// Runs `nuxt dev` of the app in the working directory against its own .data/test, beside the fake outside APIs. The
// fakes listen on fixed ports, so two suites must not run at once.
export async function startTestServer(project: TestProject, { port, env = {} }: TestServerOptions) {
	const baseUrl = `http://127.0.0.1:${port}`;
	await removeTestData();
	const hubDbClient = await readFile(HUB_DB_CLIENT, "utf8").catch(() => null);
	const stopFakePolar = await startFakePolar();
	const stopFakeStripe = await startFakeStripe();
	const stopFakeSearch = await startFakeSearch();
	const stopFakeAnthropic = await startFakeAnthropic();

	const server = spawn("npx", ["nuxt", "dev", "--port", String(port), "--host", "127.0.0.1"], {
		shell: true,
		detached: process.platform !== "win32",
		stdio: process.env.DEBUG_TEST_SERVER ? "inherit" : "ignore",
		env: {
			...process.env,
			NUXT_TEST_SERVER: "true",
			// Overrides a NUXT_AUTH_URL in .env, which would point email links at the `pnpm dev` server.
			NUXT_AUTH_URL: baseUrl,
			NUXT_REVENUE_POLAR_API_URL: FAKE_POLAR_URL,
			NUXT_REVENUE_STRIPE_API_URL: FAKE_STRIPE_URL,
			NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
			NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET: "test-google-secret",
			NUXT_SEARCH_CONSOLE_GOOGLE_OAUTH_URL: FAKE_GOOGLE_OAUTH_URL,
			NUXT_SEARCH_CONSOLE_GOOGLE_TOKEN_URL: `${FAKE_SEARCH_URL}/token`,
			NUXT_SEARCH_CONSOLE_GOOGLE_API_URL: `${FAKE_SEARCH_URL}/webmasters/v3`,
			NUXT_SEARCH_CONSOLE_BING_API_URL: `${FAKE_SEARCH_URL}/bing`,
			NUXT_ANTHROPIC_API_KEY: TEST_ANTHROPIC_KEY,
			NUXT_ANTHROPIC_API_URL: `${FAKE_ANTHROPIC_URL}/v1`,
			...env,
		},
	});
	let exited = false;
	server.on("exit", () => {
		exited = true;
	});

	const killServer = () => {
		if (exited || !server.pid) {
			return;
		}
		// `shell: true` puts the dev server behind a shell, so the whole process tree has to go.
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
		}
		else {
			process.kill(-server.pid, "SIGTERM");
		}
	};

	const stop = async () => {
		killServer();
		await stopFakePolar();
		await stopFakeStripe();
		await stopFakeSearch();
		await stopFakeAnthropic();
		if (hubDbClient !== null) {
			await writeFile(HUB_DB_CLIENT, hubDbClient);
		}
	};

	try {
		await waitUntilReady(baseUrl, () => !exited);
		// The first page render compiles the client bundle on demand and can take longer than a test's timeout.
		await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(READY_TIMEOUT_MS) });
	}
	catch (error) {
		await stop();
		throw error;
	}

	// Signs up before any test file, so this account is deterministically the first sign-up and the super-admin.
	const firstUser = newCredentials("first");
	try {
		await signUpVerified(baseUrl, firstUser);
	}
	catch (error) {
		await stop();
		throw error;
	}

	project.provide("serverUrl", baseUrl);
	project.provide("firstUser", firstUser);
	return stop;
}
