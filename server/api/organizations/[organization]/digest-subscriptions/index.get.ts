import { listDigestSubscriptions } from "#layers/core/server/db/queries/digests";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return listDigestSubscriptions(membership.memberId, membership.id);
});
