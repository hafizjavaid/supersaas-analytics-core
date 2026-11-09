import { computeConversions, getRevenueConnection } from "#layers/core/server/db/queries/revenue";
import type { ConversionsReport } from "#layers/core/shared/types/revenue";

// Lists individual Payments, so it is a Site route only and never a Share link report.
export default defineEventHandler(async (event): Promise<ConversionsReport> => {
	const { site, range, filters } = await requireSiteAndRange(event);
	const connection = await getRevenueConnection(site.id);
	const currency = connection?.currency ?? null;
	return { range, currency, ...await computeConversions(site, range, filters, currency) };
});
