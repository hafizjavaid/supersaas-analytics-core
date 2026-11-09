import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import type { UIMessage } from "ai";
import { getConversation, renameConversation, saveMessage } from "#layers/core/server/db/queries/ai";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { AI_PROVIDER_OPTIONS, requireAiMember, resolveAiModel } from "#layers/core/server/utils/ai";
import { analyticsTools } from "#layers/core/server/utils/ai/tools";
import { aiQuestionSchema } from "#layers/core/shared/schemas/ai";

const MAX_STEPS = 8;

function systemPrompt(organizationName: string, site: { id: string; name: string; domain: string } | null) {
	return [
		`You answer questions about the web analytics of the Organization "${organizationName}", using only the tools.`,
		site
			? `The question is asked from the Site "${site.name}" (${site.domain}, id ${site.id}); assume it is about this Site unless another is named.`
			: "The question is asked from the Organization's overview; call listSites to find the Sites.",
		"Answer in a few sentences of markdown, with the key numbers in bold. Visitors are counted per day, cookieless.",
		"When a trend or ranking helps, call timeseries or topList: the reader sees their results as a chart or a ranked list, so do not repeat every value.",
		"If a tool returns an error, say what went wrong. If the tools cannot answer the question, say so rather than guessing.",
	].join("\n");
}

export default defineEventHandler(async (event) => {
	const { membership } = await requireAiMember(event);
	const model = resolveAiModel();
	const parsed = aiQuestionSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const conversation = await getConversation(membership.memberId, parsed.data.conversationId ?? "");
	if (!conversation) {
		throw createError({ statusCode: 404, statusMessage: "Conversation not found" });
	}
	const { ai } = serverEdition();
	if (!await ai.claimQuestion(membership)) {
		const { limit } = await ai.allowance(membership);
		throw createError({ statusCode: 429, statusMessage: "Ask AI limit reached", message: aiQuestionLimitMessage(limit ?? 0) });
	}

	// The id is ours, not the client's: message ids are one primary key across every conversation.
	const question: UIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: parsed.data.message.text }] };
	const askedAt = Math.floor(Date.now() / 1000);
	await saveMessage(conversation.id, question, askedAt);
	if (conversation.messages.length === 0) {
		await renameConversation(conversation.id, conversationTitle(parsed.data.message.text));
	}

	const site = conversation.siteId ? await getSiteById(conversation.siteId) : undefined;
	const tools = await analyticsTools(membership.id);
	const history = [...conversation.messages, question] as UIMessage[];
	const result = streamText({
		model,
		system: systemPrompt(membership.name, site ?? null),
		messages: await convertToModelMessages(history, { tools, ignoreIncompleteToolCalls: true }),
		tools,
		stopWhen: isStepCount(MAX_STEPS),
		providerOptions: AI_PROVIDER_OPTIONS,
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({
			stream: result.stream,
			tools,
			originalMessages: history,
			onError: (error) => {
				console.error("[ai] answer failed", error);
				return "The answer could not be completed. Please try again.";
			},
			onEnd: async ({ responseMessage }) => {
				if (responseMessage.parts.length > 0) {
					await saveMessage(conversation.id, responseMessage, askedAt + 1);
				}
			},
		}),
	});
});
