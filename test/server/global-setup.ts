import type { TestProject } from "vitest/node";
import { startTestServer } from "./test-server";

export default function (project: TestProject) {
	// Open, so tests can sign up as many users as they need; the closed policy is tested through deployment overrides.
	return startTestServer(project, { port: 3100, env: { SIGNUPS: "open" } });
}
