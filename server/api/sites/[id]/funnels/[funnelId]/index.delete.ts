import { deleteFunnel } from "#layers/core/server/db/queries/funnels";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { funnel: ["delete"] });
	if (!await deleteFunnel(site.id, getRouterParam(event, "funnelId") ?? "")) {
		throw funnelNotFound();
	}
	setResponseStatus(event, 204);
	return null;
});
