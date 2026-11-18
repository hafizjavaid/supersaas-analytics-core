import { createApiKey } from "#layers/core/server/db/queries/api-keys";
import { createApiKeySchema } from "#layers/core/shared/schemas/api-keys";

export default defineEventHandler(async (event) => {
	const { membership, user } = await requireOrganizationPermission(event, { apiKey: ["create"] });
	const parsed = createApiKeySchema.safeParse(await readBody(event).catch(() => null) ?? {});
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	setResponseStatus(event, 201);
	return createApiKey(membership.id, parsed.data.name, user);
});
