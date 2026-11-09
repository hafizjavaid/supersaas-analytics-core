import { computeOutboundLinkStats } from "#layers/core/server/db/queries/outbound-links";

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireSiteAndRange(event);
	return computeOutboundLinkStats(site, range, filters);
});
