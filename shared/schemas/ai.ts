import { z } from "zod";

export const aiQuestionSchema = z.object({
	conversationId: z.string().min(1).nullish(),
	siteId: z.string().min(1).nullish(),
	message: z.object({
		text: z.string().trim().min(1, "Ask a question").max(2000),
	}),
});
