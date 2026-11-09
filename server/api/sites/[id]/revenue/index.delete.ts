import { deleteRevenueConnection } from "#layers/core/server/db/queries/revenue";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { integration: ["delete"] });
	await deleteRevenueConnection(site.id);
	setResponseStatus(event, 204);
	return null;
});
