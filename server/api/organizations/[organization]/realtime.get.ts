import { computeRealtime } from "#layers/core/server/db/queries/realtime";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return computeRealtime({ organizationId: membership.id });
});
