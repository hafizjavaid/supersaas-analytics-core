import { getRevenueConnection, saveWebhookSecret } from "#layers/core/server/db/queries/revenue";
import { webhookSecretSchema } from "#layers/core/shared/schemas/revenue";

// The signing secret of a provider that generates its own, pasted in once the webhook endpoint is added there.
export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { integration: ["create"] });
	const parsed = webhookSecretSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const connection = await getRevenueConnection(site.id);
	if (!connection) {
		throw createError({ statusCode: 404, statusMessage: "No Revenue connection" });
	}
	if (!revenueProviders[connection.provider].pastesWebhookSecret) {
		throw createError({ statusCode: 400, statusMessage: "This provider uses the secret shown on the settings page" });
	}
	return revenueConnectionOf(event, (await saveWebhookSecret(site.id, parsed.data.webhookSecret))!);
});
