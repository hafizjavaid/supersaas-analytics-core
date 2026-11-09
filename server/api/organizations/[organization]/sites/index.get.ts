import { listOrganizationSites } from "#layers/core/server/db/queries/sites";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return listOrganizationSites(membership.id);
});
