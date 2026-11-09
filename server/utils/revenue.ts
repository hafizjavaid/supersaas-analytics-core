import type { H3Event } from "h3";
import type { RevenueConnectionRow } from "#layers/core/server/db/queries/revenue";
import { lastPaymentAt } from "#layers/core/server/db/queries/revenue";
import type { RevenueConnection } from "#layers/core/shared/types/revenue";
import type { RevenueEnvironment, RevenueProviderId } from "#layers/core/shared/utils/revenue";
import { tokenHint } from "#layers/core/shared/utils/revenue";
import { polarRevenueProvider } from "./revenue-polar";
import { stripeRevenueProvider } from "./revenue-stripe";
import { appOrigin } from "./app-origin";
import { randomHex } from "./visitor-id";

export interface RevenueCredentials {
	accessToken: string;
	environment: RevenueEnvironment;
}

export interface ProviderPayment {
	providerPaymentId: string;
	providerCustomerId: string | null;
	visitorId: string;
	amount: number;
	currency: string;
	paidAt: number;
}

// Each Revenue provider (Polar and Stripe now, Paddle later) is one adapter behind this interface.
export interface RevenueProvider {
	// Stripe generates the signing secret when the endpoint is added there, so it is pasted in afterwards. Polar takes ours.
	pastesWebhookSecret: boolean;
	// Throws an error with a message for the settings page when the provider refuses the credentials.
	connect: (credentials: RevenueCredentials) => Promise<void>;
	verifyWebhook: (body: string, headers: Headers, webhookSecret: string) => Promise<boolean>;
	// Null for events that are no Payment, and for Payments without a Visitor id to attribute them to.
	parsePayment: (payload: unknown) => ProviderPayment | null;
	// Null when the provider no longer knows the customer or cannot be reached: the email is shown, never stored.
	fetchCustomerEmail: (credentials: RevenueCredentials, customerId: string) => Promise<string | null>;
}

export const revenueProviders: Record<RevenueProviderId, RevenueProvider> = {
	polar: polarRevenueProvider,
	stripe: stripeRevenueProvider,
};

export function newWebhookSecret(provider: RevenueProviderId) {
	return revenueProviders[provider].pastesWebhookSecret ? "" : randomHex(32);
}

// The access token never leaves the server. Our webhook secret is shown so it can be pasted into the provider; one the
// provider generated stays a hint, like the token.
export async function revenueConnectionOf(event: H3Event, connection: RevenueConnectionRow): Promise<RevenueConnection> {
	const pasted = revenueProviders[connection.provider].pastesWebhookSecret;
	return {
		provider: connection.provider,
		environment: connection.environment,
		currency: connection.currency,
		tokenHint: tokenHint(connection.accessToken),
		webhookUrl: `${appOrigin(event)}/api/revenue-webhooks/${connection.id}`,
		webhookSecret: pasted ? null : connection.webhookSecret,
		webhookSecretHint: pasted && connection.webhookSecret ? tokenHint(connection.webhookSecret) : null,
		createdAt: connection.createdAt,
		lastPaymentAt: await lastPaymentAt(connection.siteId),
	};
}
