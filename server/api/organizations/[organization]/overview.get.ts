import { computeAllSitesOverview } from "#layers/core/server/db/queries/all-sites";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return computeAllSitesOverview(membership.id);
});
