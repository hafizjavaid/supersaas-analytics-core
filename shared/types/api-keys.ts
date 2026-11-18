export interface ApiKey {
	id: string;
	name: string;
	prefix: string;
	// Null once the creator's account is deleted; the key keeps working.
	createdByName: string | null;
	createdAt: number;
	lastUsedAt: number | null;
}

export interface CreatedApiKey extends ApiKey {
	key: string;
}

export type ApiKeyRateLimit = { limited: false } | { limited: true; retryAfterSeconds: number };
