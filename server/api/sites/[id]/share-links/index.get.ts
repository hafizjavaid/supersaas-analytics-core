import { listShareLinks } from "#layers/core/server/db/queries/share-links";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { shareLink: ["create"] });
	return listShareLinks(site.id);
});
