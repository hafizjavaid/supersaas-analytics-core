import { computeOutboundLinkDetail } from "#layers/core/server/db/queries/outbound-links";

export default defineEventHandler(async (event) => {
	const { site, range, filters, url } = await requireSharedOutboundLinkAndRange(event);
	return computeOutboundLinkDetail(site, range, filters, url);
});
