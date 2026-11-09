import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "hub:db";
import { tables } from "#layers/core/server/utils/database";

export async function hasAnyUser() {
	const [row] = await db.select({ id: tables.user.id }).from(tables.user).limit(1);
	return Boolean(row);
}

export async function hasPendingInvitation(email: string) {
	const [row] = await db.select({ id: tables.invitation.id })
		.from(tables.invitation)
		.where(and(
			eq(sql`lower(${tables.invitation.email})`, email.toLowerCase()),
			eq(tables.invitation.status, "pending"),
			gt(tables.invitation.expiresAt, new Date()),
		))
		.limit(1);
	return Boolean(row);
}
