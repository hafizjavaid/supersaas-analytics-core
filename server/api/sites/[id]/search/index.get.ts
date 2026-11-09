import { computeSearchReport } from "#layers/core/server/db/queries/search";

export default defineEventHandler(async (event) => {
	const { site, engines, range, engine } = await requireSiteAndSearchRange(event);
	const search = getQuery(event).q;
	return computeSearchReport(site.id, engines, { range, engine, search: typeof search === "string" ? search : "" });
});
