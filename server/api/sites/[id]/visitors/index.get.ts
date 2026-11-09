import { computeVisitorList } from "#layers/core/server/db/queries/visitors";

const MAX_SEARCH_LENGTH = 200;

// `?q=` searches visitor ids and labels, countries and pages; the hundred Visitors seen most recently are listed.
export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireSiteAndRange(event);
	const query = getQuery(event);
	const search = typeof query.q === "string" ? query.q.trim().slice(0, MAX_SEARCH_LENGTH) : "";
	return { range, ...await computeVisitorList(site, range, filters, search) };
});
