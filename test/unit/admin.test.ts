import { describe, expect, it } from "vitest";
import { D1_SIZE_ALERT_BYTES, D1_SIZE_LIMIT_BYTES, databaseSizeReport, isSuperAdmin } from "#layers/core/shared/utils/admin";

const GB = 1024 ** 3;

describe("isSuperAdmin", () => {
	it("is true only for the admin role", () => {
		expect(isSuperAdmin({ role: "admin" })).toBe(true);
		expect(isSuperAdmin({ role: "user" })).toBe(false);
		expect(isSuperAdmin({ role: null })).toBe(false);
		expect(isSuperAdmin(null)).toBe(false);
	});
});

describe("databaseSizeReport", () => {
	it("alerts above 7 GB of D1's 10 GB", () => {
		expect(D1_SIZE_LIMIT_BYTES).toBe(10 * GB);
		expect(D1_SIZE_ALERT_BYTES).toBe(7 * GB);
		expect(databaseSizeReport(7 * GB)).toEqual({ sizeBytes: 7 * GB, limitBytes: 10 * GB, alertBytes: 7 * GB, alert: false });
		expect(databaseSizeReport(7 * GB + 1).alert).toBe(true);
	});
});
