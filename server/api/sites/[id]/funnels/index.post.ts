import { countFunnels, createFunnel } from "#layers/core/server/db/queries/funnels";
import { MAX_FUNNELS_PER_SITE } from "#layers/core/shared/utils/funnels";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { funnel: ["create"] });
	const input = await readFunnelInput(event);
	if (await countFunnels(site.id) >= MAX_FUNNELS_PER_SITE) {
		throw createError({ statusCode: 400, statusMessage: "Too many Funnels", message: `A site can have at most ${MAX_FUNNELS_PER_SITE} Funnels.` });
	}
	setResponseStatus(event, 201);
	return createFunnel(site.id, input);
});
