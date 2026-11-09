import { z } from "zod";
import { isVisitorId, stripeEnvironmentOf, VISITOR_METADATA_KEY } from "#layers/core/shared/utils/revenue";
import type { ProviderPayment, RevenueCredentials, RevenueProvider } from "./revenue";
import { equalInConstantTime } from "./standard-webhooks";

const STRIPE_API_URL = "https://api.stripe.com";
const TOLERANCE_SEC = 5 * 60;

const encoder = new TextEncoder();

// https://docs.stripe.com/webhooks#verify-manually: an HMAC of `<t>.<body>` keyed by the whole `whsec_` secret, in hex.
export async function verifyStripeWebhook(body: string, headers: Headers, secret: string, nowMs = Date.now()): Promise<boolean> {
	const header = headers.get("stripe-signature");
	if (!secret || !header) {
		return false;
	}
	const fields = header.split(",").map(field => field.split("=") as [string, string | undefined]);
	const timestamp = fields.find(([key]) => key === "t")?.[1];
	if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SEC) {
		return false;
	}
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
	const expected = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
	return fields.some(([version, signature]) => version === "v1" && !!signature && equalInConstantTime(signature, expected));
}

const metadataSchema = z.record(z.string(), z.unknown()).nullish();

const checkoutSessionSchema = z.object({
	id: z.string(),
	payment_status: z.string(),
	client_reference_id: z.string().nullish(),
	metadata: metadataSchema,
	amount_total: z.number().int().nonnegative(),
	total_details: z.object({ amount_tax: z.number().int().nonnegative() }).nullish(),
	currency: z.string(),
	customer: z.string().nullish(),
	invoice: z.string().nullish(),
});

// `parent.subscription_details` since API version 2025-03-31, `subscription_details` before it.
const invoiceSchema = z.object({
	id: z.string(),
	amount_paid: z.number().int().nonnegative(),
	total_excluding_tax: z.number().int().nonnegative().nullish(),
	currency: z.string(),
	customer: z.string().nullish(),
	metadata: metadataSchema,
	subscription_details: z.object({ metadata: metadataSchema }).nullish(),
	parent: z.object({ subscription_details: z.object({ metadata: metadataSchema }).nullish() }).nullish(),
	status_transitions: z.object({ paid_at: z.number().int().nullish() }).nullish(),
});

const eventSchema = z.object({
	type: z.string(),
	created: z.number().int(),
	data: z.object({ object: z.unknown() }),
});

const CHECKOUT_PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

function visitorIn(...candidates: unknown[]) {
	return candidates.find(isVisitorId) ?? null;
}

// A subscription's first payment arrives twice, as the Checkout Session and as its invoice's invoice.paid. Both are keyed
// by the invoice, so the Payment is stored once. A guest checkout has no customer, so the session stands in for it.
function paymentOfCheckout(object: unknown, created: number): ProviderPayment | null {
	const parsed = checkoutSessionSchema.safeParse(object);
	if (!parsed.success || parsed.data.payment_status !== "paid") {
		return null;
	}
	const session = parsed.data;
	const visitorId = visitorIn(session.client_reference_id, session.metadata?.[VISITOR_METADATA_KEY]);
	const amount = session.amount_total - (session.total_details?.amount_tax ?? 0);
	if (!visitorId || amount <= 0) {
		return null;
	}
	return {
		providerPaymentId: session.invoice ?? session.id,
		providerCustomerId: session.customer ?? session.id,
		visitorId,
		amount,
		currency: session.currency.toLowerCase(),
		paidAt: created,
	};
}

function paymentOfInvoice(object: unknown, created: number): ProviderPayment | null {
	const parsed = invoiceSchema.safeParse(object);
	if (!parsed.success) {
		return null;
	}
	const invoice = parsed.data;
	const visitorId = visitorIn(
		invoice.metadata?.[VISITOR_METADATA_KEY],
		invoice.parent?.subscription_details?.metadata?.[VISITOR_METADATA_KEY],
		invoice.subscription_details?.metadata?.[VISITOR_METADATA_KEY],
	);
	const amount = invoice.total_excluding_tax ?? invoice.amount_paid;
	if (!visitorId || amount <= 0) {
		return null;
	}
	return {
		providerPaymentId: invoice.id,
		providerCustomerId: invoice.customer ?? null,
		visitorId,
		amount,
		currency: invoice.currency.toLowerCase(),
		paidAt: invoice.status_transitions?.paid_at ?? created,
	};
}

// Net of discounts and before tax, like Polar's.
export function parseStripePayment(payload: unknown): ProviderPayment | null {
	const parsed = eventSchema.safeParse(payload);
	if (!parsed.success) {
		return null;
	}
	const { type, created, data } = parsed.data;
	if (CHECKOUT_PAID_EVENTS.has(type)) {
		return paymentOfCheckout(data.object, created);
	}
	if (type === "invoice.paid") {
		return paymentOfInvoice(data.object, created);
	}
	return null;
}

function stripeApi({ accessToken }: RevenueCredentials) {
	return $fetch.create({
		baseURL: useRuntimeConfig().revenue.stripeApiUrl || STRIPE_API_URL,
		headers: { authorization: `Bearer ${accessToken}` },
		timeout: 10_000,
	});
}

function statusOf(error: unknown) {
	return (error as { statusCode?: number } | null)?.statusCode;
}

function refuse(message: string, statusCode = 400): never {
	throw createError({ statusCode, statusMessage: "Stripe refused the connection", message });
}

// The email lookup reads customers, and guests' checkout sessions, so listing one of each checks both permissions.
async function connect(credentials: RevenueCredentials) {
	const keyEnvironment = stripeEnvironmentOf(credentials.accessToken);
	if (!keyEnvironment) {
		refuse("Paste a restricted key (rk_…). A restricted key can only read what Revenue attribution needs.");
	}
	if (keyEnvironment !== credentials.environment) {
		refuse(keyEnvironment === "sandbox" ? "This is a test-mode key. Choose Test mode, or paste a live key." : "This is a live key. Choose Live, or paste a test-mode key.");
	}
	for (const [path, permission] of [["/v1/customers", "Customers"], ["/v1/checkout/sessions", "Checkout Sessions"]] as const) {
		try {
			await stripeApi(credentials)(path, { query: { limit: 1 } });
		}
		catch (error) {
			const status = statusOf(error);
			if (status === 401) {
				refuse("Stripe refused this key. Check that it was copied whole and has not been deleted.");
			}
			if (status === 403) {
				refuse(`This key lacks the ${permission} Read permission.`);
			}
			refuse("Could not reach Stripe. Try again in a moment.", 502);
		}
	}
}

async function fetchCustomerEmail(credentials: RevenueCredentials, customerId: string) {
	try {
		if (customerId.startsWith("cs_")) {
			const session = await stripeApi(credentials)<{ customer_details?: { email?: string | null } | null }>(`/v1/checkout/sessions/${encodeURIComponent(customerId)}`);
			return session.customer_details?.email ?? null;
		}
		const customer = await stripeApi(credentials)<{ email?: string | null }>(`/v1/customers/${encodeURIComponent(customerId)}`);
		return customer.email ?? null;
	}
	catch {
		return null;
	}
}

export const stripeRevenueProvider: RevenueProvider = {
	pastesWebhookSecret: true,
	connect,
	verifyWebhook: verifyStripeWebhook,
	parsePayment: parseStripePayment,
	fetchCustomerEmail,
};
