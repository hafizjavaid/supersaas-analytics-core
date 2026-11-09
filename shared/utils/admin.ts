import type { DatabaseSize } from "../types/admin";

const GB = 1024 ** 3;

// D1 caps a database at 10 GB; ADR 0004 makes 7 GB the trigger to move off one shared database.
export const D1_SIZE_LIMIT_BYTES = 10 * GB;
export const D1_SIZE_ALERT_BYTES = 7 * GB;

export const ADMIN_USERS_PAGE_SIZE = 50;

export function isSuperAdmin(user: { role?: string | null } | null | undefined) {
	return user?.role === "admin";
}

export function databaseSizeReport(sizeBytes: number): DatabaseSize {
	return { sizeBytes, limitBytes: D1_SIZE_LIMIT_BYTES, alertBytes: D1_SIZE_ALERT_BYTES, alert: sizeBytes > D1_SIZE_ALERT_BYTES };
}
