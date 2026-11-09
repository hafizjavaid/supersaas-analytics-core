import { createConversation } from "#layers/core/server/db/queries/ai";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { requireAiMember } from "#layers/core/server/utils/ai";

export default defineEventHandler(async (event) => {
	const { membership } = await requireAiMember(event);
	const body = await readBody(event).catch(() => null) as { siteId?: unknown } | null;
	const siteId = typeof body?.siteId === "string" && body.siteId ? body.siteId : null;
	if (siteId) {
		const site = await getSiteById(siteId);
		if (!site || site.organizationId !== membership.id) {
			throw createError({ statusCode: 404, statusMessage: "Site not found" });
		}
	}
	return createConversation(membership.id, membership.memberId, siteId, "New conversation");
});
