import { listApiKeys } from "#layers/core/server/db/queries/api-keys";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationPermission(event, { apiKey: ["create"] });
	return listApiKeys(membership.id);
});
