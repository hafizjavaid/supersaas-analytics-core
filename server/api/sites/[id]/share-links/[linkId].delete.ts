import { deleteShareLink } from "#layers/core/server/db/queries/share-links";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { shareLink: ["delete"] });
	if (!await deleteShareLink(site.id, getRouterParam(event, "linkId") ?? "")) {
		throw createError({ statusCode: 404, statusMessage: "Share link not found" });
	}
	setResponseStatus(event, 204);
	return null;
});
