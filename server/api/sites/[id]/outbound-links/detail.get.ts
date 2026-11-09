import { computeOutboundLinkDetail } from "#layers/core/server/db/queries/outbound-links";
import { outboundLinkQuerySchema } from "#layers/core/shared/schemas/outbound-links";

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireSiteAndRange(event);
	const parsed = outboundLinkQuerySchema.safeParse(getQuery(event));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	return computeOutboundLinkDetail(site, range, filters, parsed.data.url);
});
