import { readApiV1Sites } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async (event) => {
	const apiKey = await requireApiKey(event);
	return await readApiV1Sites(apiKey.organization.id);
});
