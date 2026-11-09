import { deleteSiteWithData } from "#layers/core/server/db/queries/sites";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { site: ["delete"] });
	await deleteSiteWithData(site.id);
	setResponseStatus(event, 204);
	return null;
});
