import type { H3Event } from "h3";
import type { LanguageModelUsage, ModelMessage, SystemModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

// The spec's choices: Sonnet for Ask AI, Haiku for Digests. Self-hosted copies call them with the buyer's own key.
export const AI_CHAT_MODEL_ID = "claude-sonnet-5-5";
export const AI_DIGEST_MODEL_ID = "claude-haiku-5-5";

export function isAiEnabled() {
	return hasAi();
}

// Ask AI answers 404 without a key, as if it were never built, like the hidden menu items.
export function resolveAiModel(modelId = AI_CHAT_MODEL_ID) {
	const { apiKey, apiUrl } = useRuntimeConfig().anthropic;
	if (!apiKey) {
		throw createError({ statusCode: 404, statusMessage: "Page not found" });
	}
	return createAnthropic({ apiKey, ...(apiUrl ? { baseURL: apiUrl } : {}) })(modelId);
}

// Chat over tool results needs no deep reasoning; the server-side fallback answers a declined question on another model.
export const AI_PROVIDER_OPTIONS = {
	anthropic: { effort: "medium", fallbacks: "default" },
} as const;

const CACHE_CONTROL = { type: "ephemeral" };

// Tools render before the system prompt, so this one breakpoint caches both.
export function cachedInstructions(content: string): SystemModelMessage {
	return { role: "system", content, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } };
}

// Anthropic allows four breakpoints per request, so earlier marks must go.
export function withHistoryBreakpoint(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message, index) => {
		const { cacheControl: _, ...anthropic } = message.providerOptions?.anthropic ?? {};
		const marked = index === messages.length - 1;
		return {
			...message,
			providerOptions: { ...message.providerOptions, anthropic: marked ? { ...anthropic, cacheControl: CACHE_CONTROL } : anthropic },
		} as ModelMessage;
	});
}

export function logCacheUsage(step: number, usage: LanguageModelUsage) {
	const { noCacheTokens, cacheReadTokens, cacheWriteTokens } = usage.inputTokenDetails;
	console.info(`[ai] step ${step}: input_tokens ${noCacheTokens ?? 0}, cache_read_input_tokens ${cacheReadTokens ?? 0}, cache_creation_input_tokens ${cacheWriteTokens ?? 0}`);
}

// Ask AI handlers: the asking Member of the Organization, and 404 while Ask AI is not set up.
export async function requireAiMember(event: H3Event) {
	const access = await requireOrganizationMember(event);
	if (!isAiEnabled()) {
		throw createError({ statusCode: 404, statusMessage: "Page not found" });
	}
	return access;
}
