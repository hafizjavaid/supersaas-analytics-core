import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { acceptInvitation, addMember, createOrganization, invite, postAs, serverUrl, signUp, testDb } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { latestEmail } from "./accounts";
import type { Site } from "#layers/core/shared/types/analytics";
import { organizationFromDomain } from "#layers/core/shared/utils/domains";

await setupServer();

interface Membership extends TestOrganization {
	memberId: string;
	role: string;
}

interface MembersBody {
	members: { id: string; email: string; role: string }[];
	invitations: { id: string; email: string; role: string }[];
}

async function rolesOf(user: TestUser, organization: TestOrganization) {
	const { members } = await user.$fetch<MembersBody>(`/api/organizations/${organization.id}/members`);
	return Object.fromEntries(members.map(member => [member.email, member.role]));
}

async function organizationWithMembers() {
	const owner = await signUp("owner");
	const organization = await createOrganization(owner);
	const admin = await addMember(owner, organization.id, "admin");
	const viewer = await addMember(owner, organization.id, "viewer");
	const { members } = await owner.$fetch<MembersBody>(`/api/organizations/${organization.id}/members`);
	const ownerMemberId = members.find(member => member.role === "owner")!.id;
	return { owner, ownerMemberId, organization, admin, viewer };
}

describe("Organizations", () => {
	it("makes the creator the Owner", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);

		const memberships = await owner.$fetch<Membership[]>("/api/organizations");
		expect(memberships).toEqual([expect.objectContaining({ id: organization.id, slug: organization.slug, role: "owner" })]);
		expect(await owner.$fetch<Membership>(`/api/organizations/${organization.slug}`)).toMatchObject({ id: organization.id, role: "owner" });
	});

	it("refuses a slug that a fixed app route uses", async () => {
		const owner = await signUp();
		const response = await postAs(owner, "/api/auth/organization/create", { name: "Onboard", slug: "onboard" });
		expect(response.status).toBe(400);
		expect(await owner.$fetch<Membership[]>("/api/organizations")).toEqual([]);
	});

	it("answers 404 to a non-member for another Organization", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const stranger = await signUp();

		for (const path of [
			`/api/organizations/${organization.slug}`,
			`/api/organizations/${organization.id}`,
			`/api/organizations/${organization.id}/members`,
		]) {
			expect((await stranger.fetch(path)).status, path).toBe(404);
		}
		expect((await postAs(stranger, `/api/organizations/${organization.id}/transfer-ownership`, { memberId: "x" })).status).toBe(404);
		expect(await stranger.$fetch<Membership[]>("/api/organizations")).toEqual([]);
	});
});

describe("onboarding with a domain", () => {
	it("suggests the Organization from the domain and creates it with the domain as its first Site", async () => {
		const owner = await signUp("onboard-domain");
		const domain = `acme-${Date.now()}-${process.pid}.io`;
		const suggested = organizationFromDomain(domain);

		const page = await owner.fetch(`/app/onboard?domain=${encodeURIComponent(`https://www.${domain}/pricing`)}`);
		const html = await page.text();
		expect(page.status).toBe(200);
		expect(html).toContain(`value="${suggested.name}"`);
		expect(html).toContain(`value="${suggested.slug}"`);
		expect(html).toContain("First Site");
		expect(html).toContain(domain);

		const created = await postAs(owner, "/api/auth/organization/create", suggested);
		expect(created.status).toBe(200);
		const organization = await created.json() as TestOrganization;
		const site = await postAs(owner, `/api/organizations/${organization.id}/sites`, { name: domain, domain, timezone: "Europe/London" });
		expect(site.status).toBe(201);

		expect(await owner.$fetch<Membership[]>("/api/organizations")).toEqual([expect.objectContaining({ id: organization.id, slug: suggested.slug, name: suggested.name })]);
		expect(await owner.$fetch<Site[]>(`/api/organizations/${organization.id}/sites`)).toEqual([expect.objectContaining({ name: domain, domain, timezone: "Europe/London" })]);
	});

	it("keeps the empty form without a domain", async () => {
		const owner = await signUp("onboard-plain");
		const html = await (await owner.fetch("/app/onboard")).text();
		expect(html).toContain("Create your Organization");
		expect(html).not.toContain("First Site");
	});
});

describe("invites", () => {
	it("emails an invite that the invitee accepts after signing up", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const invitee = await signUp("invitee");

		const invited = await invite(owner, organization.id, invitee.email, "viewer");
		expect(invited.status).toBe(200);
		const invitation = await invited.json() as { id: string };

		const email = await latestEmail(serverUrl(), invitee.email, "member-invite");
		expect(email.props.url).toBe(`${serverUrl()}/auth/accept-invitation/${invitation.id}`);
		expect(email.subject).toContain(organization.name);

		expect((await acceptInvitation(invitee, invitation.id)).status).toBe(200);
		expect(await invitee.$fetch<Membership[]>("/api/organizations")).toEqual([expect.objectContaining({ id: organization.id, role: "viewer" })]);
	});

	it("lists pending invitations to members", async () => {
		const { organization, admin, viewer } = await organizationWithMembers();
		const email = `pending-${Date.now()}@example.com`;
		await invite(admin, organization.id, email, "viewer");

		const { invitations } = await viewer.$fetch<MembersBody>(`/api/organizations/${organization.id}/members`);
		expect(invitations).toContainEqual(expect.objectContaining({ email, role: "viewer" }));
	});

	it("requires a verified email to accept", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const invitee = await signUp("invitee");
		const invitation = await (await invite(owner, organization.id, invitee.email, "admin")).json() as { id: string };
		await testDb.execute({ sql: "UPDATE user SET email_verified = 0 WHERE email = ?", args: [invitee.email] });

		expect((await acceptInvitation(invitee, invitation.id)).status).toBe(403);
		expect(await invitee.$fetch<Membership[]>("/api/organizations")).toEqual([]);
	});

	it("refuses an invitation meant for another email", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const invitation = await (await invite(owner, organization.id, `someone-${Date.now()}@example.com`, "viewer")).json() as { id: string };
		const intruder = await signUp();

		expect((await acceptInvitation(intruder, invitation.id)).ok).toBe(false);
		expect(await intruder.$fetch<Membership[]>("/api/organizations")).toEqual([]);
	});

	it("never invites a second Owner", async () => {
		const { owner, organization, admin } = await organizationWithMembers();
		expect((await invite(owner, organization.id, `owner-${Date.now()}@example.com`, "owner")).status).toBe(403);
		expect((await invite(admin, organization.id, `owner-${Date.now()}@example.com`, "owner")).status).toBe(403);
	});
});

describe("role checks", () => {
	it("lets Owners and Admins invite, and refuses Viewers", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		expect((await invite(owner, organization.id, `a-${Date.now()}@example.com`, "admin")).status).toBe(200);
		expect((await invite(admin, organization.id, `b-${Date.now()}@example.com`, "viewer")).status).toBe(200);
		expect((await invite(viewer, organization.id, `c-${Date.now()}@example.com`, "viewer")).status).toBe(403);
	});

	it("lets Owners and Admins cancel an invitation, and refuses Viewers", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		const first = await (await invite(owner, organization.id, `d-${Date.now()}@example.com`, "viewer")).json() as { id: string };
		const second = await (await invite(owner, organization.id, `e-${Date.now()}@example.com`, "viewer")).json() as { id: string };

		expect((await postAs(viewer, "/api/auth/organization/cancel-invitation", { invitationId: first.id })).status).toBe(403);
		expect((await postAs(admin, "/api/auth/organization/cancel-invitation", { invitationId: first.id })).status).toBe(200);
		expect((await postAs(owner, "/api/auth/organization/cancel-invitation", { invitationId: second.id })).status).toBe(200);
	});

	it("lets an Admin change a Viewer's role, and refuses a Viewer", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		const body = { organizationId: organization.id, memberId: viewer.memberId, role: "admin" };

		expect((await postAs(viewer, "/api/auth/organization/update-member-role", body)).status).toBe(403);
		expect((await postAs(admin, "/api/auth/organization/update-member-role", body)).status).toBe(200);
		expect((await rolesOf(owner, organization))[viewer.email]).toBe("admin");
	});

	it("refuses to demote the Owner or promote anyone to Owner", async () => {
		const { owner, ownerMemberId, organization, admin, viewer } = await organizationWithMembers();

		expect((await postAs(admin, "/api/auth/organization/update-member-role", { organizationId: organization.id, memberId: ownerMemberId, role: "viewer" })).status).toBe(403);
		expect((await postAs(owner, "/api/auth/organization/update-member-role", { organizationId: organization.id, memberId: viewer.memberId, role: "owner" })).status).toBe(403);
		expect((await postAs(admin, "/api/auth/organization/update-member-role", { organizationId: organization.id, memberId: viewer.memberId, role: "owner" })).status).toBe(403);

		const roles = await rolesOf(owner, organization);
		expect(Object.values(roles).filter(role => role === "owner")).toHaveLength(1);
		expect(roles[owner.email]).toBe("owner");
	});

	it("lets an Admin remove a Viewer, and refuses a Viewer", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();

		expect((await postAs(viewer, "/api/auth/organization/remove-member", { organizationId: organization.id, memberIdOrEmail: admin.memberId })).ok).toBe(false);
		expect((await postAs(admin, "/api/auth/organization/remove-member", { organizationId: organization.id, memberIdOrEmail: viewer.memberId })).status).toBe(200);

		const roles = await rolesOf(owner, organization);
		expect(roles[viewer.email]).toBeUndefined();
		expect(roles[admin.email]).toBe("admin");
	});

	it("refuses to remove the Owner", async () => {
		const { owner, ownerMemberId, organization, admin } = await organizationWithMembers();

		const byId = await postAs(admin, "/api/auth/organization/remove-member", { organizationId: organization.id, memberIdOrEmail: ownerMemberId });
		expect(byId.status).toBe(403);
		expect((await byId.json() as { message: string }).message).toContain("Transfer ownership");
		expect((await postAs(admin, "/api/auth/organization/remove-member", { organizationId: organization.id, memberIdOrEmail: owner.email })).status).toBe(403);
		expect((await rolesOf(owner, organization))[owner.email]).toBe("owner");
	});

	it("lets Owners and Admins rename the Organization, and refuses Viewers", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		const rename = (user: TestUser, name: string) => postAs(user, "/api/auth/organization/update", { organizationId: organization.id, data: { name } });

		expect((await rename(viewer, "By viewer")).status).toBe(403);
		expect((await rename(admin, "By admin")).status).toBe(200);
		expect((await rename(owner, "By owner")).status).toBe(200);
		expect(await viewer.$fetch<Membership>(`/api/organizations/${organization.id}`)).toMatchObject({ name: "By owner" });
	});

	it("lets only the Owner delete the Organization", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		const remove = (user: TestUser) => postAs(user, "/api/auth/organization/delete", { organizationId: organization.id });

		expect((await remove(viewer)).status).toBe(403);
		expect((await remove(admin)).status).toBe(403);
		expect((await remove(owner)).status).toBe(200);
		expect((await owner.fetch(`/api/organizations/${organization.id}`)).status).toBe(404);
	});

	it("lets only the Owner transfer ownership", async () => {
		const { owner, organization, admin, viewer } = await organizationWithMembers();
		const transfer = (user: TestUser, memberId: string) => postAs(user, `/api/organizations/${organization.id}/transfer-ownership`, { memberId });

		expect((await transfer(viewer, admin.memberId)).status).toBe(403);
		expect((await transfer(admin, admin.memberId)).status).toBe(403);
		expect((await transfer(owner, admin.memberId)).status).toBe(204);

		const roles = await rolesOf(owner, organization);
		expect(roles[admin.email]).toBe("owner");
		expect(roles[owner.email]).toBe("admin");
		expect(Object.values(roles).filter(role => role === "owner")).toHaveLength(1);
	});

	it("refuses to transfer ownership to someone outside the Organization", async () => {
		const { owner, organization } = await organizationWithMembers();
		const other = await createOrganization(await signUp());
		const outsider = await addMember(owner, (await createOrganization(owner)).id, "viewer");

		expect((await postAs(owner, `/api/organizations/${organization.id}/transfer-ownership`, { memberId: outsider.memberId })).status).toBe(404);
		expect((await postAs(owner, `/api/organizations/${organization.id}/transfer-ownership`, { memberId: other.id })).status).toBe(404);
		expect((await rolesOf(owner, organization))[owner.email]).toBe("owner");
	});
});
