import type { RevenueEnvironment, RevenueProviderId } from "#layers/core/shared/utils/revenue";
import { stripeEnvironmentOf, VISITOR_METADATA_KEY } from "#layers/core/shared/utils/revenue";

export interface RevenueProviderGuide {
	name: string;
	tokenLabel: string;
	tokenHelp: string;
	tokenPlaceholder: string;
	environmentLabels: Record<RevenueEnvironment, string>;
	// Set when the key itself says which environment it belongs to, so the form asks for none.
	environmentOfToken: ((token: string) => RevenueEnvironment | null) | null;
	webhookSteps: string;
	webhookEvents: string[];
	checkoutSteps: string;
	checkoutSnippet: string;
}

export const revenueProviderGuides: Record<RevenueProviderId, RevenueProviderGuide> = {
	polar: {
		name: "Polar",
		tokenLabel: "Organization Access Token",
		tokenHelp: "In Polar: Settings → General → Developers → New token, with the customers:read scope.",
		tokenPlaceholder: "polar_oat_…",
		environmentLabels: { production: "Production", sandbox: "Sandbox" },
		environmentOfToken: null,
		webhookSteps: "In Polar: Settings → Webhooks → Add Endpoint. Paste this URL and secret, keep the Raw format, and select this event:",
		webhookEvents: ["order.paid"],
		checkoutSteps: "Read sd.visitorId() in the browser, send it to your server with the checkout request, and put it in the checkout's metadata. Polar copies it onto the order.",
		checkoutSnippet: `const checkout = await polar.checkouts.create({
	products: ["<product id>"],
	// sd.visitorId(), sent from the browser with the checkout request
	metadata: { ${VISITOR_METADATA_KEY}: visitorId },
});`,
	},
	stripe: {
		name: "Stripe",
		tokenLabel: "Restricted key",
		tokenHelp: "In Stripe: Developers → API keys → Create restricted key, with Read on Customers and Checkout Sessions.",
		tokenPlaceholder: "rk_test_… or rk_live_…",
		environmentLabels: { production: "Live", sandbox: "Test mode" },
		environmentOfToken: stripeEnvironmentOf,
		webhookSteps: "In Stripe: Developers → Webhooks → Add destination, in the same mode as the key. Paste this URL, select these events, then paste the signing secret Stripe shows below:",
		webhookEvents: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid"],
		checkoutSteps: "Read sd.visitorId() in the browser and pass it as the Checkout Session's client_reference_id. For a Payment Link, add ?client_reference_id= and the id to the link. Put it in the subscription's metadata too, so renewals are attributed.",
		checkoutSnippet: `const session = await stripe.checkout.sessions.create({
	mode: "subscription",
	line_items: [{ price: "<price id>", quantity: 1 }],
	success_url: "https://example.com/thanks",
	// sd.visitorId(), sent from the browser with the checkout request
	client_reference_id: visitorId,
	subscription_data: { metadata: { ${VISITOR_METADATA_KEY}: visitorId } },
});`,
	},
};
