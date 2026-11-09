import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, anonymousFetch, collect, createOrganization, createSiteAs, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { signedWebhookHeaders, TEST_SITE_POLAR_TOKEN } from "./polar";
import { checkoutSessionEvent, invoicePaidEvent, stripeCustomerEmail, stripeSignatureHeaders, TEST_STRIPE_KEY, TEST_STRIPE_KEY_WITHOUT_CUSTOMERS, TEST_STRIPE_KEY_WITHOUT_SESSIONS, TEST_STRIPE_LIVE_KEY, TEST_STRIPE_SIGNING_SECRET, UNKNOWN_STRIPE_CUSTOMER_ID } from "./stripe";
import type { Site, SummaryWithPrevious } from "#layers/core/shared/types/analytics";
import type { ConversionsReport, PaymentCustomers, RevenueConnection } from "#layers/core/shared/types/revenue";

await setupServer();

function revenuePath(siteId: string) {
	return `/api/sites/${siteId}/revenue`;
}

function connect(user: TestUser, siteId: string, body: Record<string, unknown> = {}) {
	return user.fetch(revenuePath(siteId), {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "stripe", environment: "sandbox", accessToken: TEST_STRIPE_KEY, currency: "usd", ...body }),
	});
}

function pasteSigningSecret(user: TestUser, siteId: string, webhookSecret = TEST_STRIPE_SIGNING_SECRET) {
	return user.fetch(revenuePath(siteId), {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ webhookSecret }),
	});
}

async function connectedWithSecret(siteId: string) {
	expect((await connect(owner, siteId)).status).toBe(200);
	const response = await pasteSigningSecret(owner, siteId);
	expect(response.status).toBe(200);
	return await response.json() as RevenueConnection;
}

function deliver(connection: RevenueConnection, payload: unknown, headers = stripeSignatureHeaders) {
	const body = JSON.stringify(payload);
	return anonymousFetch(new URL(connection.webhookUrl).pathname, { method: "POST", headers: headers(body), body });
}

function conversions(siteId: string) {
	return owner.$fetch<ConversionsReport>(`/api/sites/${siteId}/conversions?range=today`);
}

async function siteWithVisitor() {
	const created = await createSiteAs(owner, organization);
	const response = await collect({ site_id: created.id, path: "/pricing" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "NL" } });
	await waitFor(() => owner.$fetch<SummaryWithPrevious>(`/api/sites/${created.id}/summary?range=today`), summary => summary.pageviews === 1);
	return { site: created, visitorId: response.headers.get("sd-visitor")! };
}

let owner: TestUser;
let organization: TestOrganization;

beforeAll(async () => {
	owner = await signUp("stripe-owner");
	organization = await createOrganization(owner);
});

describe("connecting Stripe", () => {
	let site: Site;

	beforeAll(async () => {
		site = await createSiteAs(owner, organization);
	});

	it("checks the restricted key, then waits for the signing secret Stripe generates", async () => {
		const response = await connect(owner, site.id);
		expect(response.status).toBe(200);
		const created = await response.json() as RevenueConnection;
		expect(created).toMatchObject({ provider: "stripe", environment: "sandbox", tokenHint: "…_key", webhookSecret: null, webhookSecretHint: null });
		expect(created.webhookUrl).toMatch(/\/api\/revenue-webhooks\/[\w-]+$/);
		expect(JSON.stringify(created)).not.toContain(TEST_STRIPE_KEY);
	});

	it("keeps the pasted signing secret as a hint only", async () => {
		const saved = await (await pasteSigningSecret(owner, site.id)).json() as RevenueConnection;
		expect(saved).toMatchObject({ webhookSecret: null, webhookSecretHint: "…cret" });
		expect(JSON.stringify(saved)).not.toContain(TEST_STRIPE_SIGNING_SECRET);
		expect(await owner.$fetch(revenuePath(site.id))).toEqual({ connection: saved });

		const changed = await (await connect(owner, site.id, { currency: "eur" })).json() as RevenueConnection;
		expect(changed).toMatchObject({ currency: "eur", webhookUrl: saved.webhookUrl, webhookSecretHint: "…cret" });
	});

	it("drops the signing secret when the key moves between test mode and live, whose endpoints differ", async () => {
		const otherSite = await createSiteAs(owner, organization);
		await connectedWithSecret(otherSite.id);
		const live = await (await connect(owner, otherSite.id, { accessToken: TEST_STRIPE_LIVE_KEY, environment: "production" })).json() as RevenueConnection;
		expect(live).toMatchObject({ environment: "production", webhookSecretHint: null });
	});

	it("refuses a signing secret that is not one", async () => {
		const response = await pasteSigningSecret(owner, site.id, "not-a-secret");
		expect(response.status).toBe(400);
	});

	it("refuses a secret key, a key of the other mode and a key Stripe rejects", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const refusals: [Record<string, unknown>, string][] = [
			[{ accessToken: "sk_test_secret" }, "restricted key"],
			[{ accessToken: "rk_live_key" }, "live key"],
			[{ environment: "production" }, "test-mode key"],
			[{ accessToken: "rk_test_deleted" }, "Stripe refused this key"],
			[{ accessToken: TEST_STRIPE_KEY_WITHOUT_CUSTOMERS }, "Customers Read"],
			[{ accessToken: TEST_STRIPE_KEY_WITHOUT_SESSIONS }, "Checkout Sessions Read"],
		];
		for (const [body, message] of refusals) {
			const response = await connect(owner, otherSite.id, body);
			expect(response.status).toBe(400);
			expect((await response.json()).message).toContain(message);
		}
		expect(await owner.$fetch(revenuePath(otherSite.id))).toEqual({ connection: null });
	});

	it("drops Polar's secret when a Site switches to Stripe, and takes no pasted secret for Polar", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const polar = await (await connect(owner, otherSite.id, { provider: "polar", accessToken: TEST_SITE_POLAR_TOKEN })).json() as RevenueConnection;
		expect((await pasteSigningSecret(owner, otherSite.id)).status).toBe(400);

		const stripe = await (await connect(owner, otherSite.id)).json() as RevenueConnection;
		expect(stripe).toMatchObject({ provider: "stripe", webhookUrl: polar.webhookUrl, webhookSecret: null, webhookSecretHint: null });
	});

	it("lets Admins paste the signing secret, and keeps Viewers out", async () => {
		const admin = await addMember(owner, organization.id, "admin");
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await pasteSigningSecret(admin, site.id)).status).toBe(200);
		expect((await pasteSigningSecret(viewer, site.id)).status).toBe(403);
		expect((await pasteSigningSecret(owner, (await createSiteAs(owner, organization)).id)).status).toBe(404);
	});
});

describe("Stripe webhooks", () => {
	it("refuse every delivery until the signing secret is pasted, and any signed otherwise", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const connection = await (await connect(owner, site.id)).json() as RevenueConnection;
		const payload = checkoutSessionEvent({ amount: 4900, clientReferenceId: visitorId });
		expect((await deliver(connection, payload)).status).toBe(401);

		await pasteSigningSecret(owner, site.id);
		expect((await deliver(connection, payload, body => stripeSignatureHeaders(body, "whsec_other"))).status).toBe(401);
		expect((await deliver(connection, payload, body => signedWebhookHeaders(body, TEST_STRIPE_SIGNING_SECRET))).status).toBe(401);
		expect((await deliver(connection, payload)).status).toBe(202);
	});

	it("records a paid Checkout Session before tax, with the Visitor from client_reference_id or metadata", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const connection = await connectedWithSecret(site.id);
		expect((await deliver(connection, checkoutSessionEvent({ amount: 4900, tax: 980, clientReferenceId: visitorId }))).status).toBe(202);
		expect((await deliver(connection, checkoutSessionEvent({ amount: 1500, metadata: { sd_visitor_id: visitorId } }))).status).toBe(202);

		const { summary, rows } = await conversions(site.id);
		expect(summary).toMatchObject({ revenue: 6400, payments: 2 });
		expect(rows.map(row => row.visitorId)).toEqual([visitorId, visitorId]);
	});

	it("counts a subscription's first payment once, though it arrives as a session and as an invoice", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const connection = await connectedWithSecret(site.id);
		const metadata = { sd_visitor_id: visitorId };
		await deliver(connection, checkoutSessionEvent({ amount: 2000, mode: "subscription", invoice: "in_first", clientReferenceId: visitorId }));
		await deliver(connection, invoicePaidEvent({ amount: 2000, id: "in_first", billingReason: "subscription_create", subscriptionMetadata: metadata }));
		await deliver(connection, invoicePaidEvent({ amount: 2000, id: "in_renewal", subscriptionMetadata: metadata }));

		const { summary } = await conversions(site.id);
		expect(summary).toMatchObject({ revenue: 4000, payments: 2 });
	});

	it("ignores unpaid sessions, trials, other events and Visitors it cannot attribute", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const { visitorId: otherSitesVisitor } = await siteWithVisitor();
		const connection = await connectedWithSecret(site.id);
		const ignored = [
			checkoutSessionEvent({ amount: 4900, clientReferenceId: visitorId, paymentStatus: "unpaid" }),
			checkoutSessionEvent({ amount: 0, clientReferenceId: visitorId, mode: "subscription", paymentStatus: "no_payment_required" }),
			checkoutSessionEvent({ amount: 4900, clientReferenceId: visitorId, type: "checkout.session.expired" }),
			checkoutSessionEvent({ amount: 4900, clientReferenceId: "order-42" }),
			checkoutSessionEvent({ amount: 4900, clientReferenceId: otherSitesVisitor }),
			invoicePaidEvent({ amount: 2000 }),
		];
		for (const payload of ignored) {
			expect((await deliver(connection, payload)).status).toBe(202);
		}
		expect((await conversions(site.id)).total).toBe(0);
	});

	it("records a session that a delayed payment method pays later", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const connection = await connectedWithSecret(site.id);
		await deliver(connection, checkoutSessionEvent({ amount: 4900, clientReferenceId: visitorId, paymentStatus: "unpaid", id: "cs_test_sepa" }));
		await deliver(connection, checkoutSessionEvent({ amount: 4900, clientReferenceId: visitorId, id: "cs_test_sepa", type: "checkout.session.async_payment_succeeded" }));
		expect((await conversions(site.id)).summary).toMatchObject({ revenue: 4900, payments: 1 });
	});
});

describe("Stripe customer emails", () => {
	it("are fetched from the customer, or from a guest's Checkout Session, and never stored", async () => {
		const { site, visitorId } = await siteWithVisitor();
		const connection = await connectedWithSecret(site.id);
		await deliver(connection, checkoutSessionEvent({ amount: 100, clientReferenceId: visitorId, customer: "cus_alice" }));
		await deliver(connection, checkoutSessionEvent({ amount: 200, clientReferenceId: visitorId, customer: null, id: "cs_test_guest" }));
		await deliver(connection, checkoutSessionEvent({ amount: 300, clientReferenceId: visitorId, customer: UNKNOWN_STRIPE_CUSTOMER_ID }));
		const { rows } = await conversions(site.id);

		const customers = await owner.$fetch<PaymentCustomers>(`/api/sites/${site.id}/payments/customers?${rows.map(row => `payment=${row.id}`).join("&")}`);
		const emailByAmount = Object.fromEntries(rows.map(row => [row.amount, customers.emails[row.id]]));
		expect(emailByAmount).toEqual({ 100: stripeCustomerEmail("cus_alice"), 200: stripeCustomerEmail("cs_test_guest"), 300: null });
		const stored = await testDb.execute({ sql: "SELECT * FROM payments WHERE site_id = ?", args: [site.id] });
		expect(JSON.stringify(stored.rows)).not.toContain("@");
	});
});
