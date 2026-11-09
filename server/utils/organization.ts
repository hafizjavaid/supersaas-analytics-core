import type { H3Event } from "h3";
import { findMembership } from "#layers/core/server/db/queries/organizations";

// A non-member gets the same 404 as a missing Organization, so ids and slugs of other Organizations stay secret.
export async function requireOrganizationMember(event: H3Event) {
	const session = await requireUserSession(event);
	const membership = await findMembership(session.user.id, getRouterParam(event, "organization") ?? "");
	if (!membership) {
		throw createError({ statusCode: 404, statusMessage: "Organization not found" });
	}
	return { ...session, membership };
}

export async function requireOrganizationPermission(event: H3Event, permission: OrganizationPermission) {
	const access = await requireOrganizationMember(event);
	if (!roleCan(access.membership.role, permission)) {
		throw createError({ statusCode: 403, statusMessage: "Your role does not allow this" });
	}
	serverEdition().assertCanChange(event, access.membership, permission);
	return access;
}
