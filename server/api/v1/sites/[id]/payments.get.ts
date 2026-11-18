import { getRevenueConnection } from "#layers/core/server/db/queries/revenue";
import { readApiV1Payments } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireApiV1SiteAndRange(event);
	const connection = await getRevenueConnection(site.id);
	if (!connection) {
		throw createError({ statusCode: 404, statusMessage: "This Site has no Revenue connection" });
	}
	return await readApiV1Payments(site, range, filters, connection.currency);
});
