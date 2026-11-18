import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "hub:db";
import type { ApiKey, CreatedApiKey } from "#layers/core/shared/types/api-keys";
import { tables } from "#layers/core/server/utils/database";
import { serverEdition } from "#layers/core/server/utils/edition";
import { randomHex } from "#layers/core/server/utils/visitor-id";

const { apiKeys, organization, user } = tables;

export const API_KEY_PREFIX = "ssa_";
const VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;
const LAST_USED_RESOLUTION_SECONDS = 60;

const apiKeyColumns = {
	id: apiKeys.id,
	name: apiKeys.name,
	prefix: apiKeys.prefix,
	createdByName: user.name,
	createdAt: apiKeys.createdAt,
	lastUsedAt: apiKeys.lastUsedAt,
};

export async function hashApiKey(key: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function listApiKeys(organizationId: string): Promise<ApiKey[]> {
	return db.select(apiKeyColumns)
		.from(apiKeys)
		.leftJoin(user, eq(user.id, apiKeys.createdBy))
		.where(eq(apiKeys.organizationId, organizationId))
		.orderBy(asc(apiKeys.createdAt), asc(sql`${apiKeys}.rowid`));
}

export async function createApiKey(organizationId: string, name: string, creator: { id: string; name: string }): Promise<CreatedApiKey> {
	const key = `${API_KEY_PREFIX}${randomHex(20)}`;
	const row = {
		id: crypto.randomUUID(),
		organizationId,
		name,
		keyHash: await hashApiKey(key),
		prefix: key.slice(0, VISIBLE_PREFIX_LENGTH),
		createdBy: creator.id,
		createdAt: Math.floor(Date.now() / 1000),
		lastUsedAt: null,
	};
	await db.insert(apiKeys).values(row);
	return { id: row.id, name, prefix: row.prefix, createdByName: creator.name, createdAt: row.createdAt, lastUsedAt: null, key };
}

export async function deleteApiKey(organizationId: string, keyId: string) {
	const deleted = await db.delete(apiKeys).where(and(eq(apiKeys.organizationId, organizationId), eq(apiKeys.id, keyId))).returning({ id: apiKeys.id });
	return deleted.length > 0;
}

export interface ApiKeyOrganization extends OrganizationExtras {
	id: string;
	name: string;
	slug: string;
}

export async function findApiKeyByHash(keyHash: string) {
	const row = await db.select({
		keyId: apiKeys.id,
		lastUsedAt: apiKeys.lastUsedAt,
		id: organization.id,
		name: organization.name,
		slug: organization.slug,
		...serverEdition().organizationColumns,
	})
		.from(apiKeys)
		.innerJoin(organization, eq(organization.id, apiKeys.organizationId))
		.where(eq(apiKeys.keyHash, keyHash))
		.get();
	if (!row) {
		return undefined;
	}
	const { keyId, lastUsedAt, ...rest } = row;
	return { id: keyId, lastUsedAt, organization: rest as ApiKeyOrganization };
}

export function isLastUsedStale(lastUsedAt: number | null, nowSeconds: number) {
	return lastUsedAt === null || nowSeconds - lastUsedAt >= LAST_USED_RESOLUTION_SECONDS;
}

export async function touchApiKey(keyId: string, nowSeconds: number) {
	await db.update(apiKeys)
		.set({ lastUsedAt: nowSeconds })
		.where(and(eq(apiKeys.id, keyId), or(isNull(apiKeys.lastUsedAt), lte(apiKeys.lastUsedAt, nowSeconds - LAST_USED_RESOLUTION_SECONDS))));
}
