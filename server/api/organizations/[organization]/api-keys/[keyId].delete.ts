import { deleteApiKey } from "#layers/core/server/db/queries/api-keys";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationPermission(event, { apiKey: ["delete"] });
	if (!await deleteApiKey(membership.id, getRouterParam(event, "keyId") ?? "")) {
		throw createError({ statusCode: 404, statusMessage: "API key not found" });
	}
	setResponseStatus(event, 204);
	return null;
});
