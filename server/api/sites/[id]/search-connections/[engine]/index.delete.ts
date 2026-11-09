import { deleteSearchConnection } from "#layers/core/server/db/queries/search";

export default defineEventHandler(async (event) => {
	const { site, connection } = await requireSearchConnection(event, { integration: ["delete"] });
	await deleteSearchConnection(site.id, connection.engine);
	return { ok: true };
});
