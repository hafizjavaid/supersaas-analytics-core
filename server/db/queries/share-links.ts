import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "hub:db";
import type { ShareLink } from "#layers/core/shared/types/analytics";
import type { CreateShareLinkInput, UpdateShareLinkInput } from "#layers/core/shared/schemas/share-links";
import { tables } from "#layers/core/server/utils/database";
import { randomHex } from "#layers/core/server/utils/visitor-id";

const { shareLinks } = tables;

const shareLinkColumns = {
	id: shareLinks.id,
	name: shareLinks.name,
	token: shareLinks.token,
	hasPassword: sql<boolean>`${isNotNull(shareLinks.passwordHash)}`.mapWith(Boolean),
	outboundUrl: shareLinks.outboundUrl,
	badge: shareLinks.badge,
	badgeClicks: shareLinks.badgeClicks,
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

function ofSite(siteId: string, linkId: string) {
	return and(eq(shareLinks.siteId, siteId), eq(shareLinks.id, linkId));
}

export function getShareLink(siteId: string, linkId: string): Promise<ShareLink | undefined> {
	return db.select(shareLinkColumns).from(shareLinks).where(ofSite(siteId, linkId)).get();
}

export async function updateShareLink(siteId: string, linkId: string, change: UpdateShareLinkInput): Promise<ShareLink> {
	const link = await db.update(shareLinks).set({
		badge: change.badge,
		passwordHash: change.password ? await hashPassword(change.password) : undefined,
	}).where(ofSite(siteId, linkId)).returning(shareLinkColumns).get();
	return link!;
}

export async function countBadgeClick(linkId: string) {
	await db.update(shareLinks).set({ badgeClicks: sql`${shareLinks.badgeClicks} + 1` }).where(and(eq(shareLinks.id, linkId), eq(shareLinks.badge, true)));
}

export async function deleteShareLink(siteId: string, linkId: string) {
	const deleted = await db.delete(shareLinks).where(ofSite(siteId, linkId)).returning({ id: shareLinks.id });
	return deleted.length > 0;
}

export function getShareLinkByToken(token: string) {
	return db.select({ id: shareLinks.id, siteId: shareLinks.siteId, passwordHash: shareLinks.passwordHash, outboundUrl: shareLinks.outboundUrl, badge: shareLinks.badge }).from(shareLinks).where(eq(shareLinks.token, token)).get();
}
