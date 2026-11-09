import { computeVisitorProfile } from "#layers/core/server/db/queries/visitors";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event);
	const profile = await computeVisitorProfile(site, getRouterParam(event, "visitorId") ?? "");
	if (!profile) {
		throw createError({ statusCode: 404, statusMessage: "Visitor not found" });
	}
	return profile;
});
