import { getShareLink, updateShareLink } from "#layers/core/server/db/queries/share-links";
import { updateShareLinkSchema } from "#layers/core/shared/schemas/share-links";
import { shareLinkChangeRefusal } from "#layers/core/shared/utils/badges";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { shareLink: ["update"] });
	const parsed = updateShareLinkSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const linkId = getRouterParam(event, "linkId") ?? "";
	const link = await getShareLink(site.id, linkId);
	if (!link) {
		throw createError({ statusCode: 404, statusMessage: "Share link not found" });
	}
	const refusal = shareLinkChangeRefusal(link, parsed.data);
	if (refusal) {
		throw createError({ statusCode: 422, statusMessage: refusal });
	}
	return updateShareLink(site.id, linkId, parsed.data);
});
