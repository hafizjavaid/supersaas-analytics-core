import { computeFunnel } from "#layers/core/server/db/queries/funnels";
import type { FunnelResults } from "#layers/core/shared/types/analytics";

// The builder's live preview: an unsaved Funnel over the current Range and Filters.
export default defineEventHandler(async (event): Promise<FunnelResults> => {
	const { site, range, filters } = await requireSiteAndRange(event);
	const funnel = await readFunnelInput(event);
	return { range, ...await computeFunnel(site, range, filters, funnel) };
});
