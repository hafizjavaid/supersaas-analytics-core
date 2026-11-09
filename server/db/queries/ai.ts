import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "hub:db";
import type { AiConversation, AiConversationWithMessages } from "#layers/core/shared/types/ai";
import { tables } from "#layers/core/server/utils/database";

const { aiConversations, aiMessages } = tables;

const conversationColumns = {
	id: aiConversations.id,
	siteId: aiConversations.siteId,
	title: aiConversations.title,
	createdAt: aiConversations.createdAt,
	updatedAt: aiConversations.updatedAt,
};

// `siteId` undefined lists every conversation of the Member, null only those about the whole Organization.
export function listConversations(memberId: string, siteId?: string | null): Promise<AiConversation[]> {
	return db.select(conversationColumns)
		.from(aiConversations)
		.where(and(
			eq(aiConversations.memberId, memberId),
			siteId === undefined ? undefined : siteId === null ? isNull(aiConversations.siteId) : eq(aiConversations.siteId, siteId),
		))
		.orderBy(desc(aiConversations.updatedAt))
		.limit(50);
}

export function createConversation(organizationId: string, memberId: string, siteId: string | null, title: string): Promise<AiConversation> {
	const now = Math.floor(Date.now() / 1000);
	return db.insert(aiConversations)
		.values({ id: crypto.randomUUID(), organizationId, memberId, siteId, title, createdAt: now, updatedAt: now })
		.returning(conversationColumns)
		.get();
}

// Another Member's conversation answers the same as a missing one.
export async function getConversation(memberId: string, conversationId: string): Promise<AiConversationWithMessages | undefined> {
	const conversation = await db.select(conversationColumns)
		.from(aiConversations)
		.where(and(eq(aiConversations.id, conversationId), eq(aiConversations.memberId, memberId)))
		.get();
	if (!conversation) {
		return undefined;
	}
	const messages = await db.select({ id: aiMessages.id, role: aiMessages.role, parts: aiMessages.parts })
		.from(aiMessages)
		.where(eq(aiMessages.conversationId, conversationId))
		.orderBy(asc(aiMessages.createdAt), asc(aiMessages.id));
	return { ...conversation, messages };
}

export async function deleteConversation(memberId: string, conversationId: string) {
	const owned = await db.select({ id: aiConversations.id })
		.from(aiConversations)
		.where(and(eq(aiConversations.id, conversationId), eq(aiConversations.memberId, memberId)))
		.get();
	if (!owned) {
		return false;
	}
	await db.batch([
		db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId)),
		db.delete(aiConversations).where(eq(aiConversations.id, conversationId)),
	]);
	return true;
}

// The user's question and the streamed answer are stored apart; `createdAt` keeps them in order within the second.
export async function saveMessage(conversationId: string, message: Pick<UIMessage, "id" | "role" | "parts">, createdAt: number) {
	await db.batch([
		db.insert(aiMessages).values({
			id: message.id || crypto.randomUUID(),
			conversationId,
			role: message.role === "user" ? "user" : "assistant",
			parts: message.parts,
			createdAt,
		}),
		db.update(aiConversations).set({ updatedAt: Math.floor(Date.now() / 1000) }).where(eq(aiConversations.id, conversationId)),
	]);
}

export async function renameConversation(conversationId: string, title: string) {
	await db.update(aiConversations).set({ title }).where(eq(aiConversations.id, conversationId));
}
