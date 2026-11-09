import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { acceptInvitation, anonymousFetch, asUser, collect, createOrganization, createSiteAs, invite, overrideDeployment, postAs, serverUrl, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import { latestEmail, newCredentials, postJson, readOutbox, signIn, signUpVerified } from "./accounts";
import type { TestOrganization, TestUser } from "./helpers";
import type { Summary } from "#layers/core/shared/types/analytics";
import type { DeploymentStatus } from "#layers/core/shared/types/deployment";

await setupServer();

const DAY = 86_400_000;

async function fetchDeploymentStatus() {
	return (await anonymousFetch("/api/deployment")).json() as Promise<DeploymentStatus>;
}

async function runTask(name: string) {
	const response = await anonymousFetch(`/_nitro/tasks/${name}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ payload: {} }),
	});
	return response.json();
}

async function ownedOrganization() {
	const owner = await signUp("owner");
	return { owner, organization: await createOrganization(owner) };
}

function endTrial(organization: TestOrganization, daysAgo: number) {
	return testDb.execute({ sql: "UPDATE organization SET trial_ends_at = ? WHERE id = ?", args: [Date.now() - daysAgo * DAY, organization.id] });
}

function addSite(owner: TestUser, organization: TestOrganization, name = `Site ${Date.now()}-${Math.random()}`) {
	return owner.fetch(`/api/organizations/${organization.id}/sites`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name, domain: `${name.replaceAll(/\W/g, "-").toLowerCase()}.example.com` }),
	});
}

function waitForPageviewsOf(owner: TestUser, siteId: string, pageviews: number) {
	return waitFor(
		() => owner.$fetch<Summary>(`/api/sites/${siteId}/summary?range=today`).then(summary => summary.pageviews),
		count => count >= pageviews,
	);
}

afterAll(async () => {
	await overrideDeployment({});
});

describe("Self-hosted", () => {
	it("reports what the copy is set up with", async () => {
		expect(await fetchDeploymentStatus()).toEqual({ ai: true, signUpOpen: true, email: true, googleSearchConsole: true });
	});

	it("serves the API and collection with no key", async () => {
		const { owner, organization } = await ownedOrganization();
		const site = await createSiteAs(owner, organization);

		expect((await anonymousFetch("/api/organizations")).status).toBe(401);
		expect((await owner.fetch("/api/organizations")).status).toBe(200);
		expect((await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() })).status).toBe(204);
		expect(await waitForPageviewsOf(owner, site.id, 1)).toBe(1);
	});

	it("links to the Hosted site from the sign-in page", async () => {
		expect(await (await anonymousFetch("/auth/login")).text()).toContain("Powered by Supersaas Analytics");
	});

	it("opens the app instead of a setup page", async () => {
		expect((await anonymousFetch("/setup")).status).toBe(404);
		const app = await anonymousFetch("/app", { redirect: "manual" });
		expect(app.headers.get("location") ?? "").not.toContain("/setup");
	});

	it("runs the Rollup and search sync", async () => {
		const { owner, organization } = await ownedOrganization();
		const site = await createSiteAs(owner, organization);

		const { result } = await runTask("rollup:daily") as { result: { siteId: string }[] };
		expect(result.map(rolledUp => rolledUp.siteId)).toContain(site.id);
		expect(await runTask("search:sync")).toMatchObject({ result: { connections: expect.any(Number) } });
	});

	it("keeps the dashboard editable and collecting long after the Trial would have ended", async () => {
		const { owner, organization } = await ownedOrganization();
		await endTrial(organization, 30);

		expect((await addSite(owner, organization)).status).toBe(201);
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		expect(await waitForPageviewsOf(owner, site.id, 1)).toBe(1);
	});

	it("sells nothing: no checkout", async () => {
		const { owner, organization } = await ownedOrganization();

		expect((await postAs(owner, "/api/auth/checkout", { slug: "launch-monthly", referenceId: organization.id, redirect: false })).status).toBe(404);
	});
});

describe("Self-hosted sign-up", () => {
	async function ownedOrganizationBeforeClosing() {
		await overrideDeployment({});
		try {
			return await ownedOrganization();
		}
		finally {
			await overrideDeployment({ signUps: "closed" });
		}
	}

	beforeAll(async () => {
		await overrideDeployment({ signUps: "closed" });
	});

	it("reports sign-up closed once someone has signed up", async () => {
		expect(await fetchDeploymentStatus()).toMatchObject({ signUpOpen: false });
	});

	it("refuses an email sign-up without a pending invite, answering like a taken email", async () => {
		const credentials = newCredentials();

		expect((await postJson(serverUrl(), "/api/auth/sign-up/email", credentials)).status).toBe(200);

		expect(await readOutbox(serverUrl(), credentials.email)).toEqual([]);
		expect((await postJson(serverUrl(), "/api/auth/sign-in/email", credentials)).status).toBe(401);
	});

	it("refuses a magic-link sign-up without a pending invite", async () => {
		const { email } = newCredentials();
		await postJson(serverUrl(), "/api/auth/sign-in/magic-link", { email });
		const { props } = await latestEmail(serverUrl(), email, "magic-link");

		const response = await fetch(props.url, { redirect: "manual" });

		expect(response.headers.getSetCookie().some(cookie => cookie.includes("session_token="))).toBe(false);
	});

	it("shows the closed sign-up page, except on the way to an invitation", async () => {
		const closed = await (await anonymousFetch("/auth/sign-up")).text();
		const invited = await (await anonymousFetch("/auth/sign-up?redirect=/auth/accept-invitation/abc")).text();

		expect(closed).toContain("Sign-up is closed");
		expect(closed).not.toContain("Create account");
		expect(invited).toContain("Create account");
	});

	it("still signs in an existing user", async () => {
		const { owner } = await ownedOrganizationBeforeClosing();

		expect(await signIn(serverUrl(), owner)).toContain("session_token=");
	});

	it("lets an invited email sign up and join", async () => {
		const { owner, organization } = await ownedOrganizationBeforeClosing();
		const credentials = newCredentials("invitee");
		const invitation = await (await invite(owner, organization.id, credentials.email, "viewer")).json() as { id: string };

		const invitee = asUser(credentials, await signUpVerified(serverUrl(), credentials));

		expect((await acceptInvitation(invitee, invitation.id)).status).toBe(200);
	});

	// The test server runs with SIGNUPS=open.
	it("opens sign-up to anyone with SIGNUPS=open", async () => {
		await overrideDeployment({});
		try {
			expect(await fetchDeploymentStatus()).toMatchObject({ signUpOpen: true });
			const credentials = newCredentials();
			expect(await signUpVerified(serverUrl(), credentials)).toContain("session_token=");
		}
		finally {
			await overrideDeployment({ signUps: "closed" });
		}
	});
});

describe("Self-hosted without email", () => {
	async function signUpWithoutEmail(credentials = newCredentials()) {
		expect((await postJson(serverUrl(), "/api/auth/sign-up/email", credentials)).status).toBe(200);
		return asUser(credentials, await signIn(serverUrl(), credentials));
	}

	beforeAll(async () => {
		await overrideDeployment({ email: false });
	});

	afterAll(async () => {
		await overrideDeployment({});
	});

	it("reports email as off", async () => {
		expect(await fetchDeploymentStatus()).toMatchObject({ email: false });
	});

	it("signs a new account in with its password, sending nothing", async () => {
		const user = await signUpWithoutEmail();

		expect(user.cookie).toContain("session_token=");
		expect(await readOutbox(serverUrl(), user.email)).toEqual([]);
	});

	it("turns off magic links, password resets and verification emails", async () => {
		const { email } = newCredentials();

		expect((await postJson(serverUrl(), "/api/auth/sign-in/magic-link", { email })).status).toBe(404);
		expect((await postJson(serverUrl(), "/api/auth/request-password-reset", { email, redirectTo: "/auth/reset-password" })).status).toBe(404);
		expect((await postJson(serverUrl(), "/api/auth/send-verification-email", { email })).status).toBe(404);
	});

	it("answers an invite with the accept link, which the invitee can follow", async () => {
		const owner = await signUpWithoutEmail(newCredentials("owner"));
		const organization = await createOrganization(owner);
		const credentials = newCredentials("invitee");

		const invitation = await (await invite(owner, organization.id, credentials.email, "viewer")).json() as { id: string; url: string };

		expect(invitation.url).toBe(`${serverUrl()}/auth/accept-invitation/${invitation.id}`);
		expect(await readOutbox(serverUrl(), credentials.email)).toEqual([]);
		const invitee = await signUpWithoutEmail(credentials);
		expect((await acceptInvitation(invitee, invitation.id)).status).toBe(200);
	});

	it("skips the Digests", async () => {
		expect(await runTask("digests:send")).toEqual({ result: { skipped: "email is not configured" } });
	});
});
