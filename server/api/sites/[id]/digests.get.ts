import { listDigests } from "#layers/core/server/db/queries/digests";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event);
	return listDigests(site.id);
});
