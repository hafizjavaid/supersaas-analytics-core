import { listConversations } from "#layers/core/server/db/queries/ai";
import { requireAiMember } from "#layers/core/server/utils/ai";
import type { AiConversationList } from "#layers/core/shared/types/ai";

// `?site=` lists the conversations about one Site; without it, those about the whole Organization.
export default defineEventHandler(async (event): Promise<AiConversationList> => {
	const { membership } = await requireAiMember(event);
	const site = getQuery(event).site;
	const [conversations, allowance] = await Promise.all([
		listConversations(membership.memberId, typeof site === "string" && site ? site : null),
		serverEdition().ai.allowance(membership),
	]);
	return { conversations, allowance };
});
