import { computeJourneys } from "#layers/core/server/db/queries/journeys";
import type { Journeys } from "#layers/core/shared/types/analytics";
import { parseJourneyPath } from "#layers/core/shared/utils/journeys";

// `?path=` repeated is the chain of selected nodes, starting point first.
export default defineEventHandler(async (event): Promise<Journeys> => {
	const { site, range, filters } = await requireSiteAndRange(event);
	const path = parseJourneyPath(getQuery(event).path);
	return { range, ...await computeJourneys(site, range, filters, path) };
});
