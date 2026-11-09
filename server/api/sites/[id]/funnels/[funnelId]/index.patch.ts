import { updateFunnel } from "#layers/core/server/db/queries/funnels";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { funnel: ["update"] });
	const funnel = await updateFunnel(site.id, getRouterParam(event, "funnelId") ?? "", await readFunnelInput(event));
	if (!funnel) {
		throw funnelNotFound();
	}
	return funnel;
});
