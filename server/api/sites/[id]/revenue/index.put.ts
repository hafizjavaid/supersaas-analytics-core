import { saveRevenueConnection } from "#layers/core/server/db/queries/revenue";
import { revenueConnectionSchema } from "#layers/core/shared/schemas/revenue";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { integration: ["create"] });
	const parsed = revenueConnectionSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const { provider, environment, accessToken } = parsed.data;
	await revenueProviders[provider].connect({ environment, accessToken });
	return revenueConnectionOf(event, await saveRevenueConnection(site.id, parsed.data, newWebhookSecret(provider)));
});
