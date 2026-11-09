import { getConversation } from "#layers/core/server/db/queries/ai";
import { requireAiMember } from "#layers/core/server/utils/ai";

export default defineEventHandler(async (event) => {
	const { membership } = await requireAiMember(event);
	const conversation = await getConversation(membership.memberId, getRouterParam(event, "conversationId") ?? "");
	if (!conversation) {
		throw createError({ statusCode: 404, statusMessage: "Conversation not found" });
	}
	return conversation;
});
