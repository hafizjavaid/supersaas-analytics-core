import { eq, lt } from "drizzle-orm";
import { db } from "hub:db";
import { tables } from "#layers/core/server/utils/database";
import { randomHex } from "#layers/core/server/utils/visitor-id";

const { dailySalts } = tables;

export function utcDay(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

// Concurrent first hits of a day race to insert; `onConflictDoNothing` makes them all read the one winner.
export async function dailySalt(day = utcDay()): Promise<string> {
	const existing = await db.select({ salt: dailySalts.salt }).from(dailySalts).where(eq(dailySalts.day, day)).get();
	if (existing) {
		return existing.salt;
	}
	await db.insert(dailySalts).values({ day, salt: randomHex(32) }).onConflictDoNothing();
	await deleteEndedDailySalts(day);
	const created = await db.select({ salt: dailySalts.salt }).from(dailySalts).where(eq(dailySalts.day, day)).get();
	return created!.salt;
}

export function deleteEndedDailySalts(today = utcDay()) {
	return db.delete(dailySalts).where(lt(dailySalts.day, today));
}
