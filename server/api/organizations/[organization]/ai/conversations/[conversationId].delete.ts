import { deleteConversation } from "#layers/core/server/db/queries/ai";
import { requireAiMember } from "#layers/core/server/utils/ai";

export default defineEventHandler(async (event) => {
	const { membership } = await requireAiMember(event);
	if (!await deleteConversation(membership.memberId, getRouterParam(event, "conversationId") ?? "")) {
		throw createError({ statusCode: 404, statusMessage: "Conversation not found" });
	}
	return { ok: true };
});
