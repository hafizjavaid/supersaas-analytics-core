import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeVisitorId, hashIdentity } from "#layers/core/server/utils/visitor-id";

describe("computeVisitorId", () => {
	it("is the first 32 hex chars of sha256(salt:site_id:ip:ua)", async () => {
		const expected = createHash("sha256").update("salt-1:site-1:203.0.113.7:Mozilla/5.0").digest("hex").slice(0, 32);
		expect(await computeVisitorId("salt-1", "site-1", "203.0.113.7", "Mozilla/5.0")).toBe(expected);
	});

	it("differs per Site for the same person", async () => {
		const first = await computeVisitorId("salt-1", "site-1", "203.0.113.7", "Mozilla/5.0");
		const second = await computeVisitorId("salt-1", "site-2", "203.0.113.7", "Mozilla/5.0");
		expect(first).not.toBe(second);
	});

	it("differs per daily salt for the same person", async () => {
		const today = await computeVisitorId("salt-1", "site-1", "203.0.113.7", "Mozilla/5.0");
		const tomorrow = await computeVisitorId("salt-2", "site-1", "203.0.113.7", "Mozilla/5.0");
		expect(today).not.toBe(tomorrow);
	});
});

describe("hashIdentity", () => {
	it("is hex hmac-sha256(secret, id)", async () => {
		const expected = createHmac("sha256", "site-secret").update("user-42").digest("hex");
		expect(await hashIdentity("site-secret", "user-42")).toBe(expected);
	});

	it("differs per Site secret for the same id", async () => {
		expect(await hashIdentity("secret-a", "user-42")).not.toBe(await hashIdentity("secret-b", "user-42"));
	});
});
