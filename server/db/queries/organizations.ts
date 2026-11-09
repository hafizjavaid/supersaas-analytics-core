import { and, asc, eq, or } from "drizzle-orm";
import { db } from "hub:db";
import { tables } from "#layers/core/server/utils/database";
import { serverEdition } from "#layers/core/server/utils/edition";

const membershipColumns = {
	id: tables.organization.id,
	name: tables.organization.name,
	slug: tables.organization.slug,
	logo: tables.organization.logo,
	createdAt: tables.organization.createdAt,
	memberId: tables.member.id,
	role: tables.member.role,
};

function selectMemberships() {
	return db.select({ ...membershipColumns, ...serverEdition().organizationColumns })
		.from(tables.member)
		.innerJoin(tables.organization, eq(tables.organization.id, tables.member.organizationId));
}

type MembershipRow = Awaited<ReturnType<typeof selectMemberships>>[number] & OrganizationExtras;

export async function listMemberships(userId: string) {
	return await selectMemberships()
		.where(eq(tables.member.userId, userId))
		.orderBy(asc(tables.organization.name)) as MembershipRow[];
}

export async function findMembership(userId: string, organizationIdOrSlug: string) {
	return await selectMemberships()
		.where(and(
			eq(tables.member.userId, userId),
			or(eq(tables.organization.id, organizationIdOrSlug), eq(tables.organization.slug, organizationIdOrSlug)),
		))
		.get() as MembershipRow | undefined;
}

export function findMember(organizationId: string, memberIdOrEmail: string) {
	return db.select({ id: tables.member.id, role: tables.member.role, userId: tables.member.userId })
		.from(tables.member)
		.innerJoin(tables.user, eq(tables.user.id, tables.member.userId))
		.where(and(
			eq(tables.member.organizationId, organizationId),
			or(eq(tables.member.id, memberIdOrEmail), eq(tables.user.email, memberIdOrEmail.toLowerCase())),
		))
		.get();
}

export async function listMembersAndInvitations(organizationId: string) {
	const [members, invitations] = await Promise.all([
		db.select({
			id: tables.member.id,
			userId: tables.member.userId,
			role: tables.member.role,
			createdAt: tables.member.createdAt,
			name: tables.user.name,
			email: tables.user.email,
			image: tables.user.image,
		})
			.from(tables.member)
			.innerJoin(tables.user, eq(tables.user.id, tables.member.userId))
			.where(eq(tables.member.organizationId, organizationId))
			.orderBy(asc(tables.member.createdAt)),
		db.select({
			id: tables.invitation.id,
			email: tables.invitation.email,
			role: tables.invitation.role,
			expiresAt: tables.invitation.expiresAt,
		})
			.from(tables.invitation)
			.where(and(eq(tables.invitation.organizationId, organizationId), eq(tables.invitation.status, "pending")))
			.orderBy(asc(tables.invitation.createdAt)),
	]);
	return { members, invitations };
}

// D1 has no interactive transactions; a batch is atomic, so the Organization never has zero or two Owners.
export async function transferOwnership(organizationId: string, fromMemberId: string, toMemberId: string) {
	await db.batch([
		db.update(tables.member)
			.set({ role: "owner" })
			.where(and(eq(tables.member.organizationId, organizationId), eq(tables.member.id, toMemberId))),
		db.update(tables.member)
			.set({ role: "admin" })
			.where(and(eq(tables.member.organizationId, organizationId), eq(tables.member.id, fromMemberId))),
	]);
}

export function findOrganizationOwner(organizationId: string) {
	return db.select({ email: tables.user.email, organizationName: tables.organization.name, organizationSlug: tables.organization.slug })
		.from(tables.member)
		.innerJoin(tables.user, eq(tables.user.id, tables.member.userId))
		.innerJoin(tables.organization, eq(tables.organization.id, tables.member.organizationId))
		.where(and(eq(tables.member.organizationId, organizationId), eq(tables.member.role, "owner")))
		.get();
}

export function findOldestOrganization() {
	return db.select().from(tables.organization).orderBy(asc(tables.organization.createdAt)).limit(1).get();
}
