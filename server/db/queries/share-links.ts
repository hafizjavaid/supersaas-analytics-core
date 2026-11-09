import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "hub:db";
import type { ShareLink } from "#layers/core/shared/types/analytics";
import type { CreateShareLinkInput } from "#layers/core/shared/schemas/share-links";
import { tables } from "#layers/core/server/utils/database";
import { randomHex } from "#layers/core/server/utils/visitor-id";

const { shareLinks } = tables;

const shareLinkColumns = {
	id: shareLinks.id,
	name: shareLinks.name,
	token: shareLinks.token,
	hasPassword: sql<boolean>`${isNotNull(shareLinks.passwordHash)}`.mapWith(Boolean),
	outboundUrl: shareLinks.outboundUrl,
	createdAt: shareLinks.createdAt,
};

export function listShareLinks(siteId: string): Promise<ShareLink[]> {
	return db.select(shareLinkColumns).from(shareLinks).where(eq(shareLinks.siteId, siteId)).orderBy(asc(shareLinks.createdAt), asc(sql`rowid`));
}

export async function createShareLink(siteId: string, input: CreateShareLinkInput): Promise<ShareLink> {
	const link = await db.insert(shareLinks).values({
		id: crypto.randomUUID(),
		siteId,
		name: input.name,
		token: randomHex(24),
		passwordHash: input.password ? await hashPassword(input.password) : null,
		outboundUrl: input.outboundUrl ?? null,
		createdAt: Math.floor(Date.now() / 1000),
	}).returning(shareLinkColumns).get();
	return link!;
}

export async function deleteShareLink(siteId: string, linkId: string) {
	const deleted = await db.delete(shareLinks).where(and(eq(shareLinks.siteId, siteId), eq(shareLinks.id, linkId))).returning({ id: shareLinks.id });
	return deleted.length > 0;
}

export function getShareLinkByToken(token: string) {
	return db.select({ id: shareLinks.id, siteId: shareLinks.siteId, passwordHash: shareLinks.passwordHash, outboundUrl: shareLinks.outboundUrl }).from(shareLinks).where(eq(shareLinks.token, token)).get();
}
