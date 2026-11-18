import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, anonymousFetch, createOrganization, createSiteAs, postAs, signUp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import type { ApiKey, CreatedApiKey } from "#layers/core/shared/types/api-keys";

await setupServer();

const KEY_PATH = "/api/v1/sites";

function bearer(key: string) {
	return { headers: { authorization: `Bearer ${key}` } };
}

function keysPath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/api-keys`;
}

async function createKey(user: TestUser, organization: TestOrganization, name = "Claude Code") {
	const response = await postAs(user, keysPath(organization), { name });
	expect(response.status).toBe(201);
	return await response.json() as CreatedApiKey;
}

async function ownerWithOrganization() {
	const owner = await signUp("owner");
	return { owner, organization: await createOrganization(owner) };
}

describe("managing API keys", () => {
	it("shows a new key once and lists it by name, prefix and creator, never the key", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const created = await createKey(owner, organization);

		expect(created.key).toMatch(/^ssa_[0-9a-f]{40}$/);
		expect(created.key.startsWith(created.prefix)).toBe(true);
		expect(created).toMatchObject({ name: "Claude Code", createdByName: owner.name, lastUsedAt: null });

		const listed = await owner.$fetch<ApiKey[]>(keysPath(organization));
		expect(listed).toEqual([{ id: created.id, name: "Claude Code", prefix: created.prefix, createdByName: owner.name, createdAt: created.createdAt, lastUsedAt: null }]);
		expect(JSON.stringify(listed)).not.toContain(created.key.slice(created.prefix.length));
	});

	it("lets Owners and Admins manage keys, but not Viewers or strangers", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const admin = await addMember(owner, organization.id, "admin");
		const viewer = await addMember(owner, organization.id, "viewer");
		const stranger = await signUp("stranger");
		await createOrganization(stranger);

		const byAdmin = await createKey(admin, organization, "By admin");
		expect((await admin.fetch(keysPath(organization))).status).toBe(200);

		expect((await postAs(viewer, keysPath(organization), { name: "Nope" })).status).toBe(403);
		expect((await viewer.fetch(keysPath(organization))).status).toBe(403);
		expect((await viewer.fetch(`${keysPath(organization)}/${byAdmin.id}`, { method: "DELETE" })).status).toBe(403);

		expect((await postAs(stranger, keysPath(organization), { name: "Nope" })).status).toBe(404);
		expect((await stranger.fetch(`${keysPath(organization)}/${byAdmin.id}`, { method: "DELETE" })).status).toBe(404);

		expect((await owner.fetch(`${keysPath(organization)}/${byAdmin.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await owner.fetch(`${keysPath(organization)}/${byAdmin.id}`, { method: "DELETE" })).status).toBe(404);
		expect(await owner.$fetch<ApiKey[]>(keysPath(organization))).toEqual([]);
	});

	it("does not let an Owner revoke another Organization's key through their own Organization", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const key = await createKey(owner, organization);
		const { owner: otherOwner, organization: otherOrganization } = await ownerWithOrganization();

		expect((await otherOwner.fetch(`${keysPath(otherOrganization)}/${key.id}`, { method: "DELETE" })).status).toBe(404);
		expect((await anonymousFetch(KEY_PATH, bearer(key.key))).status).toBe(200);
	});

	it("names a key \"API key\" when no name is given", async () => {
		const { owner, organization } = await ownerWithOrganization();
		expect(await createKey(owner, organization, "  ")).toMatchObject({ name: "API key" });
	});

	it("keeps a key working after its creator leaves the Organization", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const admin = await addMember(owner, organization.id, "admin");
		const created = await createKey(admin, organization);

		const removed = await postAs(owner, "/api/auth/organization/remove-member", { organizationId: organization.id, memberIdOrEmail: admin.email });
		expect(removed.status).toBe(200);

		expect(await owner.$fetch<ApiKey[]>(keysPath(organization))).toMatchObject([{ id: created.id, createdByName: admin.name }]);
		expect((await anonymousFetch(KEY_PATH, bearer(created.key))).status).toBe(200);
	});
});

describe("reading with an API key", () => {
	it("reads the key's Organization", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const site = await createSiteAs(owner, organization);
		const created = await createKey(owner, organization);

		const response = await anonymousFetch(KEY_PATH, bearer(created.key));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ sites: [{ id: site.id }] });
	});

	it("refuses a missing, malformed or unknown key with 401", async () => {
		expect((await anonymousFetch(KEY_PATH)).status).toBe(401);
		expect((await anonymousFetch(KEY_PATH, { headers: { authorization: "Basic abc" } })).status).toBe(401);
		expect((await anonymousFetch(KEY_PATH, bearer(`ssa_${"0".repeat(40)}`))).status).toBe(401);
	});

	it("refuses a revoked key with 401 on the next request", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const created = await createKey(owner, organization);
		expect((await anonymousFetch(KEY_PATH, bearer(created.key))).status).toBe(200);

		expect((await owner.fetch(`${keysPath(organization)}/${created.id}`, { method: "DELETE" })).status).toBe(204);

		expect((await anonymousFetch(KEY_PATH, bearer(created.key))).status).toBe(401);
	});

	it("records when a key was last used", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const created = await createKey(owner, organization);
		const before = Math.floor(Date.now() / 1000);

		await anonymousFetch(KEY_PATH, bearer(created.key));

		const [listed] = await waitFor(() => owner.$fetch<ApiKey[]>(keysPath(organization)), keys => keys[0]?.lastUsedAt !== null);
		expect(listed!.lastUsedAt).toBeGreaterThanOrEqual(before);
	});

	it("does not let a session cookie stand in for a key", async () => {
		const { owner } = await ownerWithOrganization();
		expect((await owner.fetch(KEY_PATH)).status).toBe(401);
	});

	it("sets no rate limit on a Self-hosted copy", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const created = await createKey(owner, organization);
		for (let request = 1; request <= 61; request++) {
			await anonymousFetch(KEY_PATH, bearer(created.key));
		}

		expect((await anonymousFetch(KEY_PATH, bearer(created.key))).status).toBe(200);
	});
});

describe("the API keys settings page", () => {
	it("lists each key by name and prefix to an Owner, and tells a Viewer who manages them", async () => {
		const { owner, organization } = await ownerWithOrganization();
		const viewer = await addMember(owner, organization.id, "viewer");
		const created = await createKey(owner, organization, "Nightly report");
		const pagePath = `/app/${organization.slug}/settings/api-keys`;

		const ownerPage = await (await owner.fetch(pagePath)).text();
		expect(ownerPage).toContain("Nightly report");
		expect(ownerPage).toContain(created.prefix);
		expect(ownerPage).not.toContain(created.key);

		const viewerPage = await (await viewer.fetch(pagePath)).text();
		expect(viewerPage).toContain("Only Owners and Admins can see and create API keys.");
		expect(viewerPage).not.toContain("Nightly report");
	});
});
