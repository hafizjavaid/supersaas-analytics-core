import { saveSearchCredential } from "#layers/core/server/db/queries/search";
import { bingApiKeySchema } from "#layers/core/shared/schemas/search";

// Bing connects with an API key, checked by listing its sites before it is stored. Google connects through OAuth.
export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { integration: ["create"] });
	if (getRouterParam(event, "engine") !== "bing") {
		throw createError({ statusCode: 404, statusMessage: "Page not found" });
	}
	const parsed = bingApiKeySchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	await askSearchEngine("bing", () => listBingProperties(parsed.data.apiKey));
	return searchConnectionOf(await saveSearchCredential(site.id, "bing", await sealCredential(parsed.data.apiKey)));
});
