import { computeKeywordDetail } from "#layers/core/server/db/queries/search";

export default defineEventHandler(async (event) => {
	const { site, range, engine } = await requireSiteAndSearchRange(event);
	const query = getQuery(event).query;
	if (typeof query !== "string" || !query) {
		throw createError({ statusCode: 400, statusMessage: "Pass the keyword as ?query=" });
	}
	return computeKeywordDetail(site.id, query, { range, engine });
});
