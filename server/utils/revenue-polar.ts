import { z } from "zod";
import { isVisitorId, VISITOR_METADATA_KEY } from "#layers/core/shared/utils/revenue";
import type { ProviderPayment, RevenueCredentials, RevenueProvider } from "./revenue";
import { verifyStandardWebhook } from "./standard-webhooks";

const POLAR_API_URLS = {
	production: "https://api.polar.sh",
	sandbox: "https://sandbox-api.polar.sh",
};

// Polar copies checkout metadata onto the order, which is where `sd_visitor_id` arrives.
const orderPaidSchema = z.object({
	type: z.literal("order.paid"),
	data: z.object({
		id: z.string(),
		created_at: z.string(),
		net_amount: z.number().int().nonnegative(),
		currency: z.string(),
		customer_id: z.string().nullish(),
		metadata: z.record(z.string(), z.unknown()).nullish(),
	}),
});

// Net of discounts and before tax, which is what the Site earns.
export function parsePolarPayment(payload: unknown): ProviderPayment | null {
	const parsed = orderPaidSchema.safeParse(payload);
	if (!parsed.success) {
		return null;
	}
	const order = parsed.data.data;
	const visitorId = order.metadata?.[VISITOR_METADATA_KEY];
	const paidAtMs = Date.parse(order.created_at);
	if (!isVisitorId(visitorId) || Number.isNaN(paidAtMs)) {
		return null;
	}
	return {
		providerPaymentId: order.id,
		providerCustomerId: order.customer_id ?? null,
		visitorId,
		amount: order.net_amount,
		currency: order.currency.toLowerCase(),
		paidAt: Math.floor(paidAtMs / 1000),
	};
}

function polarApi({ accessToken, environment }: RevenueCredentials) {
	return $fetch.create({
		baseURL: useRuntimeConfig().revenue.polarApiUrl || POLAR_API_URLS[environment],
		headers: { authorization: `Bearer ${accessToken}` },
		timeout: 10_000,
	});
}

function statusOf(error: unknown) {
	return (error as { statusCode?: number } | null)?.statusCode;
}

// The customers:read scope is the one the email lookup needs, so listing one customer checks the token and its scope at once.
async function connect(credentials: RevenueCredentials) {
	try {
		await polarApi(credentials)("/v1/customers/", { query: { limit: 1 } });
	}
	catch (error) {
		const status = statusOf(error);
		const message = status === 401
			? `Polar refused this access token. Check that it is an Organization Access Token from Polar's ${credentials.environment === "sandbox" ? "sandbox" : "production"} dashboard.`
			: status === 403
				? "This access token lacks the customers:read scope."
				: "Could not reach Polar. Try again in a moment.";
		throw createError({ statusCode: status === 401 || status === 403 ? 400 : 502, statusMessage: "Polar refused the connection", message });
	}
}

async function fetchCustomerEmail(credentials: RevenueCredentials, customerId: string) {
	try {
		const customer = await polarApi(credentials)<{ email?: string | null }>(`/v1/customers/${encodeURIComponent(customerId)}`);
		return customer.email ?? null;
	}
	catch {
		return null;
	}
}

export const polarRevenueProvider: RevenueProvider = {
	pastesWebhookSecret: false,
	connect,
	verifyWebhook: verifyStandardWebhook,
	parsePayment: parsePolarPayment,
	fetchCustomerEmail,
};
