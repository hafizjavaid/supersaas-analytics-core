import { createHmac, randomUUID } from "node:crypto";

// The test server talks to this stand-in for Polar's API, started in test-server.ts.
export const FAKE_POLAR_PORT = 3101;
export const FAKE_POLAR_URL = `http://127.0.0.1:${FAKE_POLAR_PORT}`;

export const POLAR_ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";

export interface OrderFields {
	productId: string;
	email: string;
	id?: string;
	externalCustomerId?: string | null;
	customerId?: string;
	amount?: number;
	currency?: string;
	createdAt?: Date;
	metadata?: Record<string, string>;
}

// A paid one-time order as Polar's order.paid webhook sends it, with only the fields the SDK's parser requires.
export function orderPaidPayload(fields: OrderFields) {
	const now = (fields.createdAt ?? new Date()).toISOString();
	const amount = fields.amount ?? 14900;
	const customerId = fields.customerId ?? "77777777-7777-4777-8777-777777777777";
	return {
		type: "order.paid",
		timestamp: now,
		data: {
			id: fields.id ?? randomUUID(),
			created_at: now,
			modified_at: now,
			status: "paid",
			paid: true,
			subtotal_amount: amount,
			discount_amount: 0,
			net_amount: amount,
			tax_amount: 0,
			total_amount: amount,
			applied_balance_amount: 0,
			due_amount: 0,
			refunded_amount: 0,
			refunded_tax_amount: 0,
			currency: fields.currency ?? "usd",
			billing_reason: "purchase",
			billing_name: null,
			billing_address: null,
			invoice_number: null,
			is_invoice_generated: false,
			receipt_number: null,
			customer_id: customerId,
			product_id: fields.productId,
			discount_id: null,
			subscription_id: null,
			checkout_id: null,
			metadata: fields.metadata ?? {},
			platform_fee_amount: 0,
			platform_fee_currency: null,
			customer: {
				id: customerId,
				created_at: "2026-01-01T00:00:00Z",
				modified_at: null,
				metadata: {},
				external_id: fields.externalCustomerId ?? null,
				email: fields.email,
				email_verified: true,
				type: "individual",
				name: null,
				billing_name: null,
				billing_address: null,
				tax_id: null,
				organization_id: POLAR_ORGANIZATION_ID,
				deleted_at: null,
				avatar_url: null,
			},
			product: null,
			discount: null,
			subscription: null,
			items: [],
			description: "One-time purchase",
			refundable_amount: amount,
			refundable_tax_amount: 0,
		},
	};
}

// A Site's own Polar connection: the stand-in accepts only this token, and lacks the customers:read scope for the second.
export const TEST_SITE_POLAR_TOKEN = "polar_oat_site_token";
export const TEST_SITE_POLAR_TOKEN_WITHOUT_SCOPE = "polar_oat_no_scope";
export const UNKNOWN_POLAR_CUSTOMER_ID = "99999999-9999-4999-8999-999999999999";

export function polarCustomerEmail(customerId: string) {
	return `buyer-${customerId.slice(0, 8)}@example.com`;
}

function headersSignedWith(body: string, key: Buffer) {
	const id = `msg_${randomUUID()}`;
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
	return {
		"content-type": "application/json",
		"webhook-id": id,
		"webhook-timestamp": timestamp,
		"webhook-signature": `v1,${signature}`,
	};
}

// How Polar signs with a secret made before 8 September 2026: keyed by the secret's UTF-8 bytes.
export function signedWebhookHeaders(body: string, secret: string) {
	return headersSignedWith(body, Buffer.from(secret, "utf8"));
}

// How Polar signs with a secret made since then, the Standard Webhooks way: keyed by the base64 after `whsec_`.
export function standardWebhookHeaders(body: string, secret: string) {
	return headersSignedWith(body, Buffer.from(secret.replace(/^whsec_/, ""), "base64"));
}
