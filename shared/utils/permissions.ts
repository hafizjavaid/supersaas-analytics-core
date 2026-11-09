import { createAccessControl } from "better-auth/plugins/access";

export const memberRoles = ["owner", "admin", "viewer"] as const;
export type MemberRole = typeof memberRoles[number];

export const invitableRoles = ["admin", "viewer"] as const satisfies readonly MemberRole[];
export type InvitableRole = typeof invitableRoles[number];

// Better Auth checks `organization`, `member` and `invitation`. The rest follow the spec's role table.
export const organizationAccess = createAccessControl({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	site: ["create", "update", "delete"],
	goal: ["create", "delete"],
	funnel: ["create", "update", "delete"],
	shareLink: ["create", "delete"],
	integration: ["create", "delete"],
	customerEmail: ["read"],
	billing: ["manage"],
	ownership: ["transfer"],
} as const);

export const organizationRoles = {
	owner: organizationAccess.newRole({
		organization: ["update", "delete"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		site: ["create", "update", "delete"],
		goal: ["create", "delete"],
		funnel: ["create", "update", "delete"],
		shareLink: ["create", "delete"],
		integration: ["create", "delete"],
		customerEmail: ["read"],
		billing: ["manage"],
		ownership: ["transfer"],
	}),
	admin: organizationAccess.newRole({
		organization: ["update"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		site: ["create", "update", "delete"],
		goal: ["create", "delete"],
		funnel: ["create", "update", "delete"],
		shareLink: ["create", "delete"],
		integration: ["create", "delete"],
		customerEmail: ["read"],
	}),
	viewer: organizationAccess.newRole({}),
} satisfies Record<MemberRole, unknown>;

type Statements = typeof organizationAccess.statements;
export type OrganizationPermission = { [Resource in keyof Statements]?: Statements[Resource][number][] };

export function isMemberRole(value: unknown): value is MemberRole {
	return memberRoles.includes(value as MemberRole);
}

export function isInvitableRole(value: unknown): value is InvitableRole {
	return invitableRoles.includes(value as InvitableRole);
}

export function roleCan(role: string, permission: OrganizationPermission) {
	if (!isMemberRole(role)) {
		return false;
	}
	return organizationRoles[role].authorize(permission).success;
}

export const memberRoleLabels: Record<MemberRole, string> = {
	owner: "Owner",
	admin: "Admin",
	viewer: "Viewer",
};
