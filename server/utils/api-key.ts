import type { H3Event } from "h3";
import { API_KEY_PREFIX, findApiKeyByHash, hashApiKey, isLastUsedStale, touchApiKey } from "#layers/core/server/db/queries/api-keys";

function bearerToken(event: H3Event) {
	const match = /^Bearer\s+(\S+)$/i.exec(getHeader(event, "authorization") ?? "");
	return match?.[1];
}

export async function apiKeyRateLimit(event: H3Event, apiKeyId: string) {
	return await serverEdition().rateLimitApiKey?.(event, apiKeyId) ?? { limited: false as const };
}

async function enforceRateLimit(event: H3Event, apiKeyId: string) {
	const rateLimit = await apiKeyRateLimit(event, apiKeyId);
	if (rateLimit.limited) {
		setResponseHeader(event, "Retry-After", rateLimit.retryAfterSeconds);
		throw createError({ statusCode: 429, statusMessage: "Too many requests for this API key" });
	}
}

// MCP passes `countRequest: false` and counts each tool call instead, so the handshake and tool list are free.
export async function requireApiKey(event: H3Event, { countRequest = true } = {}) {
	const token = bearerToken(event);
	const apiKey = token?.startsWith(API_KEY_PREFIX) ? await findApiKeyByHash(await hashApiKey(token)) : undefined;
	if (!apiKey) {
		setResponseHeader(event, "WWW-Authenticate", "Bearer");
		throw createError({ statusCode: 401, statusMessage: "Invalid API key" });
	}
	if (countRequest) {
		await enforceRateLimit(event, apiKey.id);
	}
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (isLastUsedStale(apiKey.lastUsedAt, nowSeconds)) {
		event.waitUntil(touchApiKey(apiKey.id, nowSeconds).catch(error => console.error("[api-key]", error)));
	}
	return { id: apiKey.id, organization: apiKey.organization };
}
