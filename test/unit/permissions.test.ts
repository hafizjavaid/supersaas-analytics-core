import { describe, expect, it } from "vitest";
import { roleCan } from "#layers/core/shared/utils/permissions";
import type { OrganizationPermission } from "#layers/core/shared/utils/permissions";

const roleTable: [string, OrganizationPermission, { owner: boolean; admin: boolean; viewer: boolean }][] = [
	["manage Sites", { site: ["create", "update", "delete"] }, { owner: true, admin: true, viewer: false }],
	["manage Goals", { goal: ["create", "delete"] }, { owner: true, admin: true, viewer: false }],
	["manage Funnels", { funnel: ["create", "update", "delete"] }, { owner: true, admin: true, viewer: false }],
	["manage Share links", { shareLink: ["create", "delete"] }, { owner: true, admin: true, viewer: false }],
	["connect integrations", { integration: ["create", "delete"] }, { owner: true, admin: true, viewer: false }],
	["see full customer emails", { customerEmail: ["read"] }, { owner: true, admin: true, viewer: false }],
	["invite Members", { invitation: ["create"] }, { owner: true, admin: true, viewer: false }],
	["remove Members", { member: ["delete"] }, { owner: true, admin: true, viewer: false }],
	["rename the Organization", { organization: ["update"] }, { owner: true, admin: true, viewer: false }],
	["delete the Organization", { organization: ["delete"] }, { owner: true, admin: false, viewer: false }],
	["manage billing", { billing: ["manage"] }, { owner: true, admin: false, viewer: false }],
	["transfer ownership", { ownership: ["transfer"] }, { owner: true, admin: false, viewer: false }],
];

describe("roleCan", () => {
	for (const [action, permission, expected] of roleTable) {
		it(`follows the spec's role table to ${action}`, () => {
			expect({
				owner: roleCan("owner", permission),
				admin: roleCan("admin", permission),
				viewer: roleCan("viewer", permission),
			}).toEqual(expected);
		});
	}

	it("allows nothing for an unknown role", () => {
		expect(roleCan("member", { site: ["create"] })).toBe(false);
	});
});
