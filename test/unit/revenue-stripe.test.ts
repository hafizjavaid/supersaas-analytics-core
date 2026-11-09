import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stripeEnvironmentOf } from "#layers/core/shared/utils/revenue";
import { parseStripePayment, verifyStripeWebhook } from "#layers/core/server/utils/revenue-stripe";

const visitorId = "0123456789abcdef0123456789abcdef";
const otherVisitorId = "fedcba9876543210fedcba9876543210";
const eventCreated = 1_791_633_600;

function sign(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
	const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
	return new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` });
}

describe("verifyStripeWebhook", () => {
	const body = JSON.stringify({ type: "invoice.paid" });

	it("accepts a body signed with the signing secret", async () => {
		expect(await verifyStripeWebhook(body, sign(body, "whsec_test"), "whsec_test")).toBe(true);
	});

	it("accepts any of several v1 signatures, as while a secret is rolled", async () => {
		const headers = sign(body, "whsec_test");
		headers.set("stripe-signature", `${headers.get("stripe-signature")},v1=${"0".repeat(64)},v0=${"1".repeat(64)}`);
		expect(await verifyStripeWebhook(body, headers, "whsec_test")).toBe(true);
	});

	it("refuses another secret, a changed body, a missing header and an unset secret", async () => {
		expect(await verifyStripeWebhook(body, sign(body, "whsec_other"), "whsec_test")).toBe(false);
		expect(await verifyStripeWebhook(`${body} `, sign(body, "whsec_test"), "whsec_test")).toBe(false);
		expect(await verifyStripeWebhook(body, new Headers(), "whsec_test")).toBe(false);
		expect(await verifyStripeWebhook(body, sign(body, ""), "")).toBe(false);
	});

	it("refuses a delivery older than five minutes, so a captured one cannot be replayed", async () => {
		const stale = Math.floor(Date.now() / 1000) - 6 * 60;
		expect(await verifyStripeWebhook(body, sign(body, "whsec_test", stale), "whsec_test")).toBe(false);
	});
});

function event(type: string, object: Record<string, unknown>) {
	return { id: "evt_1", object: "event", type, created: eventCreated, livemode: false, data: { object } };
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
	return event("checkout.session.completed", {
		id: "cs_test_1",
		object: "checkout.session",
		mode: "payment",
		payment_status: "paid",
		client_reference_id: visitorId,
		metadata: {},
		amount_total: 5880,
		total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 980 },
		currency: "usd",
		customer: "cus_1",
		invoice: null,
		...overrides,
	});
}

function invoicePaid(overrides: Record<string, unknown> = {}) {
	return event("invoice.paid", {
		id: "in_1",
		object: "invoice",
		billing_reason: "subscription_cycle",
		amount_paid: 1200,
		total_excluding_tax: 1000,
		currency: "eur",
		customer: "cus_2",
		metadata: {},
		parent: { type: "subscription_details", subscription_details: { metadata: { sd_visitor_id: visitorId }, subscription: "sub_1" } },
		status_transitions: { paid_at: eventCreated - 5 },
		...overrides,
	});
}

describe("parseStripePayment", () => {
	it("turns a paid Checkout Session into a Payment, before tax", () => {
		expect(parseStripePayment(checkoutSession())).toEqual({
			providerPaymentId: "cs_test_1",
			providerCustomerId: "cus_1",
			visitorId,
			amount: 4900,
			currency: "usd",
			paidAt: eventCreated,
		});
	});

	it("reads the Visitor from client_reference_id first, then from metadata", () => {
		expect(parseStripePayment(checkoutSession({ client_reference_id: otherVisitorId, metadata: { sd_visitor_id: visitorId } }))?.visitorId).toBe(otherVisitorId);
		expect(parseStripePayment(checkoutSession({ client_reference_id: "order-42", metadata: { sd_visitor_id: visitorId } }))?.visitorId).toBe(visitorId);
		expect(parseStripePayment(checkoutSession({ client_reference_id: null, metadata: {} }))).toBeNull();
	});

	it("keys a subscription's first payment by its invoice, so the invoice.paid of the same payment is not counted twice", () => {
		const session = parseStripePayment(checkoutSession({ mode: "subscription", invoice: "in_first" }));
		const invoice = parseStripePayment(invoicePaid({ id: "in_first", billing_reason: "subscription_create" }));
		expect(session?.providerPaymentId).toBe("in_first");
		expect(invoice?.providerPaymentId).toBe("in_first");
	});

	it("keeps a guest checkout's session as the customer, which is where Stripe keeps the email", () => {
		expect(parseStripePayment(checkoutSession({ customer: null }))?.providerCustomerId).toBe("cs_test_1");
	});

	it("waits for a delayed payment method to succeed", () => {
		expect(parseStripePayment(checkoutSession({ payment_status: "unpaid" }))).toBeNull();
		const succeeded = { ...checkoutSession(), type: "checkout.session.async_payment_succeeded" };
		expect(parseStripePayment(succeeded)?.amount).toBe(4900);
	});

	it("ignores a checkout that took no payment, such as a trial", () => {
		expect(parseStripePayment(checkoutSession({ payment_status: "no_payment_required", amount_total: 0 }))).toBeNull();
	});

	it("turns a paid invoice into a Payment with the Visitor from the subscription's metadata", () => {
		expect(parseStripePayment(invoicePaid())).toEqual({
			providerPaymentId: "in_1",
			providerCustomerId: "cus_2",
			visitorId,
			amount: 1000,
			currency: "eur",
			paidAt: eventCreated - 5,
		});
	});

	it("reads the Visitor of an invoice from its own metadata, and from subscription_details of older API versions", () => {
		expect(parseStripePayment(invoicePaid({ parent: null, metadata: { sd_visitor_id: otherVisitorId } }))?.visitorId).toBe(otherVisitorId);
		expect(parseStripePayment(invoicePaid({ parent: null, subscription_details: { metadata: { sd_visitor_id: otherVisitorId } } }))?.visitorId).toBe(otherVisitorId);
		expect(parseStripePayment(invoicePaid({ parent: null }))).toBeNull();
	});

	it("ignores an invoice of nothing, such as a trial's", () => {
		expect(parseStripePayment(invoicePaid({ amount_paid: 0, total_excluding_tax: 0 }))).toBeNull();
	});

	it("ignores other events and payloads missing what a Payment needs", () => {
		expect(parseStripePayment({ ...invoicePaid(), type: "invoice.created" })).toBeNull();
		expect(parseStripePayment(event("checkout.session.completed", { id: "cs_test_1" }))).toBeNull();
		expect(parseStripePayment("invoice.paid")).toBeNull();
	});
});

describe("stripeEnvironmentOf", () => {
	it("tells test-mode restricted keys from live ones, and refuses any other key", () => {
		expect(stripeEnvironmentOf("rk_test_abc")).toBe("sandbox");
		expect(stripeEnvironmentOf("rk_live_abc")).toBe("production");
		expect(stripeEnvironmentOf("sk_test_abc")).toBeNull();
		expect(stripeEnvironmentOf("pk_live_abc")).toBeNull();
	});
});
