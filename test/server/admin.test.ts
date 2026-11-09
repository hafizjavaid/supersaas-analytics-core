import { beforeAll, describe, expect, inject, it } from "vitest";
import { setupServer } from "./setup";
import { anonymousFetch, asUser, createOrganization, createSiteAs, findUser as findUserAs, postAs, serverUrl, signUp } from "./helpers";
import type { TestUser } from "./helpers";
import { signIn } from "./accounts";
import type { AdminOrganization, AdminUser, AdminUserList, DatabaseSize } from "#layers/core/shared/types/admin";

await setupServer();

const GB = 1024 ** 3;
const ADMIN_ENDPOINTS = ["/api/admin/users", "/api/admin/organizations", "/api/admin/database"];

let superAdmin: TestUser;

beforeAll(async () => {
	const first = inject("firstUser");
	superAdmin = asUser(first, await signIn(serverUrl(), first));
});

function findUser(email: string) {
	return findUserAs(superAdmin, email);
}

function impersonationStart(admin: TestUser, userId: string) {
	return postAs(admin, "/api/auth/admin/impersonate-user", { userId });
}

async function expectSetPasswordSignsIn(user: TestUser) {
	const newPassword = `set-by-the-admin-${Date.now()}`;
	const response = await postAs(superAdmin, "/api/auth/admin/set-user-password", { userId: (await findUser(user.email)).id, newPassword });
	expect(response.status).toBe(200);
	expect(await signIn(serverUrl(), { ...user, password: newPassword })).toBeTruthy();
}

describe("admin area access", () => {
	it("answers 404 to signed-out visitors and to users who are not super-admins", async () => {
		const user = await signUp();
		for (const path of ADMIN_ENDPOINTS) {
			expect((await anonymousFetch(path)).status, path).toBe(404);
			expect((await user.fetch(path)).status, path).toBe(404);
		}
		expect((await user.fetch("/api/auth/admin/list-users")).status).toBe(404);
		expect((await impersonationStart(user, "anyone")).status).toBe(404);
	});

	it("serves the admin endpoints and Better Auth's admin API to the super-admin", async () => {
		for (const path of [...ADMIN_ENDPOINTS, "/api/auth/admin/list-users"]) {
			expect((await superAdmin.fetch(path)).status, path).toBe(200);
		}
	});
});

describe("setting a password", () => {
	it("lets the super-admin set a user's password", async () => {
		const user = await signUp();
		await expectSetPasswordSignsIn(user);
	});

	it("answers 404 to anyone else", async () => {
		const user = await signUp();
		const other = await signUp();
		const response = await postAs(user, "/api/auth/admin/set-user-password", { userId: (await findUser(other.email)).id, newPassword: "not-allowed-123" });
		expect(response.status).toBe(404);
		expect(await signIn(serverUrl(), other)).toBeTruthy();
	});
});

describe("admin pages", () => {
	const ADMIN_PAGES = ["/app/admin", "/app/admin/organizations", "/app/admin/database"];

	it("renders every admin page for the super-admin only", async () => {
		const user = await signUp();
		for (const path of ADMIN_PAGES) {
			const page = await superAdmin.fetch(path);
			expect(page.status, path).toBe(200);
			expect(await page.text(), path).toMatch(/^<!DOCTYPE html>/);
			expect((await user.fetch(path)).status, path).toBe(404);
		}
	});

	it("lists users, searchable by email, with their role", async () => {
		const user = await signUp("listed");
		const { users, total } = await superAdmin.$fetch<AdminUserList>(`/api/admin/users?q=${encodeURIComponent(user.email)}`);
		expect(total).toBe(1);
		expect(users).toEqual([expect.objectContaining<Partial<AdminUser>>({ email: user.email, name: user.name, role: "user", organizations: 0 })]);
		expect((await findUser(inject("firstUser").email)).role).toBe("admin");
	});

	it("lists Organizations with their Owner, Members and Sites", async () => {
		const owner = await signUp("owner");
		const organization = await createOrganization(owner);
		await createSiteAs(owner, organization);

		const listed = (await superAdmin.$fetch<AdminOrganization[]>("/api/admin/organizations")).find(row => row.id === organization.id);
		expect(listed).toMatchObject({ name: organization.name, slug: organization.slug, ownerEmail: owner.email, members: 1, sites: 1 });
		expect(listed).not.toHaveProperty("billing");
		expect(listed).not.toHaveProperty("usage");
	});

	it("counts each user's Organizations", async () => {
		const owner = await signUp("owner");
		await createOrganization(owner);

		const { users } = await superAdmin.$fetch<AdminUserList>(`/api/admin/users?q=${encodeURIComponent(owner.email)}`);
		expect(users).toEqual([expect.objectContaining({ email: owner.email, organizations: 1 })]);
	});

	it("shows the database size against the D1 limit", async () => {
		const database = await superAdmin.$fetch<DatabaseSize>("/api/admin/database");
		expect(database.sizeBytes).toBeGreaterThan(0);
		expect(database).toMatchObject({ limitBytes: 10 * GB, alertBytes: 7 * GB, alert: false });
	});
});

describe("impersonation", () => {
	it("is not part of core: starting, stopping and the audit log answer 404, even for the super-admin", async () => {
		const user = await signUp();
		expect((await impersonationStart(superAdmin, (await findUser(user.email)).id)).status).toBe(404);
		expect((await postAs(user, "/api/auth/admin/stop-impersonating", {})).status).toBe(404);
		expect((await superAdmin.fetch("/api/admin/impersonations")).status).toBe(404);
		expect((await superAdmin.fetch("/app/admin/impersonations")).status).toBe(404);
	});

	it("offers no View as on the Users page", async () => {
		await signUp();
		const html = await (await superAdmin.fetch("/app/admin")).text();
		expect(html).toContain("Set password");
		expect(html).not.toContain("View as");
	});
});
