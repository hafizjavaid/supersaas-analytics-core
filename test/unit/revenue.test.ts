import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatMoney, isVisitorId, maskEmail } from "#layers/core/shared/utils/revenue";
import { parsePolarPayment } from "#layers/core/server/utils/revenue-polar";
import { verifyStandardWebhook } from "#layers/core/server/utils/standard-webhooks";

describe("maskEmail", () => {
	it("keeps the first letter and the domain", () => {
		expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
	});

	it("hides an address without a local part entirely", () => {
		expect(maskEmail("@example.com")).toBe("***");
		expect(maskEmail("not-an-email")).toBe("***");
	});
});

describe("formatMoney", () => {
	it("reads amounts in cents", () => {
		expect(formatMoney(4900, "usd")).toBe("$49");
		expect(formatMoney(4950, "usd")).toBe("$49.50");
	});

	it("knows currencies without a minor unit", () => {
		expect(formatMoney(4900, "jpy")).toBe("¥4,900");
	});

	it("shortens large amounts when compact", () => {
		expect(formatMoney(1_250_000, "eur", { compact: true })).toBe("€12.5K");
	});
});

describe("isVisitorId", () => {
	it("accepts the 32 hex characters sd.visitorId() returns", () => {
		expect(isVisitorId("0123456789abcdef0123456789abcdef")).toBe(true);
		expect(isVisitorId("not-a-visitor")).toBe(false);
		expect(isVisitorId(42)).toBe(false);
	});
});

function sign(body: string, secret: string | Buffer, id = "msg_1", timestamp = Math.floor(Date.now() / 1000)) {
	const signature = createHmac("sha256", typeof secret === "string" ? Buffer.from(secret, "utf8") : secret).update(`${id}.${timestamp}.${body}`).digest("base64");
	return new Headers({ "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${signature}` });
}

describe("verifyStandardWebhook", () => {
	const body = JSON.stringify({ type: "order.paid" });

	it("accepts a body signed with the secret", async () => {
		expect(await verifyStandardWebhook(body, sign(body, "secret"), "secret")).toBe(true);
	});

	it("accepts any of several signatures, as during a secret rotation", async () => {
		const headers = sign(body, "secret");
		headers.set("webhook-signature", `v1,bm90LWl0 ${headers.get("webhook-signature")}`);
		expect(await verifyStandardWebhook(body, headers, "secret")).toBe(true);
	});

	it("refuses another secret, a changed body and missing headers", async () => {
		expect(await verifyStandardWebhook(body, sign(body, "other"), "secret")).toBe(false);
		expect(await verifyStandardWebhook(`${body} `, sign(body, "secret"), "secret")).toBe(false);
		expect(await verifyStandardWebhook(body, new Headers(), "secret")).toBe(false);
	});

	it("accepts a Standard Webhooks secret, keyed by the base64 after whsec_, as Polar issues since 8 September 2026", async () => {
		const key = Buffer.from("0123456789abcdef0123456789abcdef");
		const secret = `whsec_${key.toString("base64")}`;
		expect(await verifyStandardWebhook(body, sign(body, key), secret)).toBe(true);
		expect(await verifyStandardWebhook(body, sign(body, secret), secret)).toBe(true);
	});

	it("refuses everything when the secret is empty", async () => {
		expect(await verifyStandardWebhook(body, sign(body, ""), "")).toBe(false);
	});

	it("refuses a delivery older than five minutes, so a captured one cannot be replayed", async () => {
		const stale = Math.floor(Date.now() / 1000) - 6 * 60;
		expect(await verifyStandardWebhook(body, sign(body, "secret", "msg_1", stale), "secret")).toBe(false);
	});
});

const visitorId = "0123456789abcdef0123456789abcdef";

function orderPaid(overrides: Record<string, unknown> = {}) {
	return {
		type: "order.paid",
		data: {
			id: "order-1",
			created_at: "2026-10-10T12:00:00Z",
			net_amount: 4900,
			total_amount: 5880,
			currency: "USD",
			customer_id: "customer-1",
			metadata: { sd_visitor_id: visitorId },
			...overrides,
		},
	};
}

describe("parsePolarPayment", () => {
	it("turns a paid order into a Payment, before tax", () => {
		expect(parsePolarPayment(orderPaid())).toEqual({
			providerPaymentId: "order-1",
			providerCustomerId: "customer-1",
			visitorId,
			amount: 4900,
			currency: "usd",
			paidAt: Date.parse("2026-10-10T12:00:00Z") / 1000,
		});
	});

	it("ignores other events", () => {
		expect(parsePolarPayment({ ...orderPaid(), type: "order.created" })).toBeNull();
		expect(parsePolarPayment({ type: "subscription.active", data: {} })).toBeNull();
	});

	it("ignores an order without a Visitor id in its metadata", () => {
		expect(parsePolarPayment(orderPaid({ metadata: {} }))).toBeNull();
		expect(parsePolarPayment(orderPaid({ metadata: { sd_visitor_id: "../../etc" } }))).toBeNull();
	});

	it("ignores a payload missing what a Payment needs", () => {
		expect(parsePolarPayment({ type: "order.paid", data: { id: "order-1" } })).toBeNull();
		expect(parsePolarPayment("order.paid")).toBeNull();
	});
});
