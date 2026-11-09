import { createHmac, randomUUID } from "node:crypto";

// The test server reads Sites' Stripe accounts from this stand-in, started in global-setup.ts.
export const FAKE_STRIPE_PORT = 3102;
export const FAKE_STRIPE_URL = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;

// The stand-in accepts only these restricted keys, and denies each of the last two one Read permission.
export const TEST_STRIPE_KEY = "rk_test_site_key";
export const TEST_STRIPE_LIVE_KEY = "rk_live_site_key";
export const TEST_STRIPE_KEY_WITHOUT_CUSTOMERS = "rk_test_no_customers";
export const TEST_STRIPE_KEY_WITHOUT_SESSIONS = "rk_test_no_sessions";
export const UNKNOWN_STRIPE_CUSTOMER_ID = "cus_unknown";
export const TEST_STRIPE_SIGNING_SECRET = "whsec_test_signing_secret";

export function stripeCustomerEmail(id: string) {
	return `${id.replace(/_/g, "-")}@example.com`;
}

function stripeId(prefix: string) {
	return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function testModeEvent(type: string, object: Record<string, unknown>) {
	return {
		id: stripeId("evt"),
		object: "event",
		api_version: "2025-09-30.clover",
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		pending_webhooks: 1,
		request: { id: null, idempotency_key: null },
		type,
		data: { object },
	};
}

export interface CheckoutSessionFields {
	amount: number;
	clientReferenceId?: string | null;
	metadata?: Record<string, string>;
	id?: string;
	customer?: string | null;
	invoice?: string | null;
	mode?: "payment" | "subscription";
	paymentStatus?: "paid" | "unpaid" | "no_payment_required";
	tax?: number;
	currency?: string;
	type?: string;
}

// A Checkout Session as Stripe's test mode sends checkout.session.completed, trimmed to the fields around a payment.
export function checkoutSessionEvent(fields: CheckoutSessionFields) {
	const tax = fields.tax ?? 0;
	return testModeEvent(fields.type ?? "checkout.session.completed", {
		id: fields.id ?? stripeId("cs_test"),
		object: "checkout.session",
		amount_subtotal: fields.amount,
		amount_total: fields.amount + tax,
		client_reference_id: fields.clientReferenceId ?? null,
		created: Math.floor(Date.now() / 1000) - 60,
		currency: fields.currency ?? "usd",
		customer: fields.customer === undefined ? stripeId("cus") : fields.customer,
		customer_details: { email: "never-stored@example.com", name: null, tax_exempt: "none" },
		invoice: fields.invoice ?? null,
		livemode: false,
		metadata: fields.metadata ?? {},
		mode: fields.mode ?? "payment",
		payment_link: null,
		payment_status: fields.paymentStatus ?? "paid",
		status: "complete",
		subscription: fields.mode === "subscription" ? stripeId("sub") : null,
		total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: tax },
	});
}

export interface InvoiceFields {
	amount: number;
	subscriptionMetadata?: Record<string, string>;
	id?: string;
	customer?: string;
	billingReason?: "subscription_create" | "subscription_cycle" | "manual";
	tax?: number;
}

// An invoice as Stripe's test mode sends invoice.paid since API version 2025-03-31, with the subscription under `parent`.
export function invoicePaidEvent(fields: InvoiceFields) {
	const tax = fields.tax ?? 0;
	const now = Math.floor(Date.now() / 1000);
	return testModeEvent("invoice.paid", {
		id: fields.id ?? stripeId("in"),
		object: "invoice",
		amount_due: fields.amount + tax,
		amount_paid: fields.amount + tax,
		amount_remaining: 0,
		billing_reason: fields.billingReason ?? "subscription_cycle",
		currency: "usd",
		customer: fields.customer ?? stripeId("cus"),
		customer_email: "never-stored@example.com",
		livemode: false,
		metadata: {},
		parent: {
			type: "subscription_details",
			quote_details: null,
			subscription_details: { metadata: fields.subscriptionMetadata ?? {}, subscription: stripeId("sub") },
		},
		status: "paid",
		status_transitions: { finalized_at: now, marked_uncollectible_at: null, paid_at: now, voided_at: null },
		subtotal: fields.amount,
		total: fields.amount + tax,
		total_excluding_tax: fields.amount,
	});
}

// https://docs.stripe.com/webhooks#verify-manually
export function stripeSignatureHeaders(body: string, secret = TEST_STRIPE_SIGNING_SECRET) {
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
	return { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` };
}
