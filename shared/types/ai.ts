import type { UIMessage } from "ai";
import type { AiAllowance } from "../utils/ai";

export interface AiConversation {
	id: string;
	siteId: string | null;
	title: string;
	createdAt: number;
	updatedAt: number;
}

export interface AiConversationWithMessages extends AiConversation {
	messages: Pick<UIMessage, "id" | "role" | "parts">[];
}

export interface AiConversationList {
	conversations: AiConversation[];
	allowance: AiAllowance;
}
