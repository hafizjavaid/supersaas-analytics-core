import { getRevenueConnection } from "#layers/core/server/db/queries/revenue";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { integration: ["create"] });
	const connection = await getRevenueConnection(site.id);
	return { connection: connection ? await revenueConnectionOf(event, connection) : null };
});
