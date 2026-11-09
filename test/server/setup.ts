import { setup } from "@nuxt/test-utils/e2e";
import { inject } from "vitest";

export async function setupServer() {
	await setup({ host: inject("serverUrl") });
}
