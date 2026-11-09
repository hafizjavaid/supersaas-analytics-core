import { computeRealtime } from "#layers/core/server/db/queries/realtime";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event);
	return computeRealtime({ siteId: site.id });
});
