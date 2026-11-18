import { getFunnel } from "#layers/core/server/db/queries/funnels";
import { readApiV1FunnelReport } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireApiV1SiteAndRange(event);
	const funnel = await getFunnel(site.id, getRouterParam(event, "funnelId") ?? "");
	if (!funnel) {
		throw funnelNotFound();
	}
	return await readApiV1FunnelReport(site, range, filters, funnel);
});
