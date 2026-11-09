import { listMembersAndInvitations } from "#layers/core/server/db/queries/organizations";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return listMembersAndInvitations(membership.id);
});
