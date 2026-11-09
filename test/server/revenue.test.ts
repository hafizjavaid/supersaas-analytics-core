import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, anonymousFetch, collect, createOrganization, createSiteAs, signUp, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor } from "./helpers";
import type { Hit, TestOrganization, TestUser } from "./helpers";
import { orderPaidPayload, polarCustomerEmail, signedWebhookHeaders, TEST_SITE_POLAR_TOKEN, TEST_SITE_POLAR_TOKEN_WITHOUT_SCOPE, UNKNOWN_POLAR_CUSTOMER_ID } from "./polar";
import type { AllSitesOverview, PageStats, ShareLink, Site, SummaryWithPrevious, TimeseriesPoint } from "#layers/core/shared/types/analytics";
import type { ConversionsReport, PaymentCustomers, PaymentJourney, RevenueConnection } from "#layers/core/shared/types/revenue";

await setupServer();

const PRODUCT_ID = "88888888-8888-4888-8888-888888888888";
const ALICE_CUSTOMER = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB_CUSTOMER = "bbbbbbbb-0000-4000-8000-000000000002";

function revenuePath(siteId: string) {
	return `/api/sites/${siteId}/revenue`;
}

function connect(user: TestUser, siteId: string, body: Record<string, unknown> = {}) {
	return user.fetch(revenuePath(siteId), {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "polar", environment: "sandbox", accessToken: TEST_SITE_POLAR_TOKEN, currency: "usd", ...body }),
	});
}

async function connected(user: TestUser, siteId: string, body: Record<string, unknown> = {}) {
	const response = await connect(user, siteId, body);
	expect(response.status).toBe(200);
	return await response.json() as RevenueConnection;
}

interface PaymentFields {
	visitorId: string;
	amount: number;
	customerId: string;
	currency?: string;
	id?: string;
}

function deliver(connection: RevenueConnection, payload: unknown, secret = connection.webhookSecret!) {
	const body = JSON.stringify(payload);
	return anonymousFetch(new URL(connection.webhookUrl).pathname, { method: "POST", headers: signedWebhookHeaders(body, secret), body });
}

function paymentPayload({ visitorId, amount, customerId, currency, id }: PaymentFields) {
	return orderPaidPayload({ productId: PRODUCT_ID, email: "unused@example.com", id, amount, currency, customerId, metadata: { sd_visitor_id: visitorId } });
}

async function hit(body: Record<string, unknown>, from: Hit) {
	const response = await collect(body, from);
	return response.headers.get("sd-visitor")!;
}

function from(country: string): Hit {
	return { ip: uniqueIp(), headers: { "x-vercel-ip-country": country } };
}

let owner: TestUser;
let organization: TestOrganization;
let site: Site;
let connection: RevenueConnection;
let aliceId: string;
let bobId: string;

function conversions(user: TestUser = owner, siteId = site.id, query = "range=today") {
	return user.$fetch<ConversionsReport>(`/api/sites/${siteId}/conversions?${query}`);
}

// alice: CH, from google.com, / two minutes before /pricing, pays $49
// bob:   US, direct, /blog, pays $20 and then €15
beforeAll(async () => {
	owner = await signUp("owner");
	organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization, { timezone: timezoneAwayFromMidnight() });
	const alice = from("CH");
	const bob = from("US");
	aliceId = await hit({ site_id: site.id, path: "/", referrer: "https://www.google.com/" }, alice);
	await hit({ site_id: site.id, path: "/pricing" }, alice);
	bobId = await hit({ site_id: site.id, path: "/blog" }, bob);
	await waitFor(() => owner.$fetch<SummaryWithPrevious>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 3);
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - 120 WHERE visitor_id = ?", args: [aliceId] },
		{ sql: "UPDATE pages SET timestamp = timestamp - 120 WHERE site_id = ? AND path = '/'", args: [site.id] },
	]);

	connection = await connected(owner, site.id);
	for (const payment of [
		{ visitorId: aliceId, amount: 4900, customerId: ALICE_CUSTOMER },
		{ visitorId: bobId, amount: 2000, customerId: BOB_CUSTOMER },
		{ visitorId: bobId, amount: 1500, customerId: BOB_CUSTOMER, currency: "eur" },
	]) {
		expect((await deliver(connection, paymentPayload(payment))).status).toBe(202);
	}
});

describe("connecting Polar", () => {
	it("verifies the access token and shows the webhook URL and secret, never the token", async () => {
		const otherSite = await createSiteAs(owner, organization);
		expect(await owner.$fetch(revenuePath(otherSite.id))).toEqual({ connection: null });

		const created = await connected(owner, otherSite.id);
		expect(created).toMatchObject({ provider: "polar", environment: "sandbox", currency: "usd", tokenHint: "…oken", lastPaymentAt: null });
		expect(created.webhookUrl).toMatch(/\/api\/revenue-webhooks\/[\w-]+$/);
		expect(created.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(created)).not.toContain(TEST_SITE_POLAR_TOKEN);
		expect(await owner.$fetch(revenuePath(otherSite.id))).toEqual({ connection: created });
	});

	it("keeps the webhook URL and secret when the connection changes", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const first = await connected(owner, otherSite.id);
		const second = await connected(owner, otherSite.id, { currency: "eur" });
		expect(second).toMatchObject({ currency: "eur", webhookUrl: first.webhookUrl, webhookSecret: first.webhookSecret });
	});

	it("refuses a token Polar rejects or one without the customers:read scope", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const rejected = await connect(owner, otherSite.id, { accessToken: "polar_oat_wrong" });
		expect(rejected.status).toBe(400);
		expect((await rejected.json()).message).toContain("Polar refused this access token");
		const unscoped = await connect(owner, otherSite.id, { accessToken: TEST_SITE_POLAR_TOKEN_WITHOUT_SCOPE });
		expect(unscoped.status).toBe(400);
		expect((await unscoped.json()).message).toContain("customers:read");
		expect((await connect(owner, otherSite.id, { provider: "paddle" })).status).toBe(400);
		expect(await owner.$fetch(revenuePath(otherSite.id))).toEqual({ connection: null });
	});

	it("lets Admins connect, and keeps Viewers and outsiders out", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const admin = await addMember(owner, organization.id, "admin");
		const viewer = await addMember(owner, organization.id, "viewer");
		const stranger = await signUp("stranger");

		expect((await connect(admin, otherSite.id)).status).toBe(200);
		expect((await connect(viewer, otherSite.id)).status).toBe(403);
		expect((await viewer.fetch(revenuePath(otherSite.id))).status).toBe(403);
		expect((await connect(stranger, otherSite.id)).status).toBe(404);
	});

	it("disconnects, which hides Revenue but keeps the Payments", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const visitorId = await hit({ site_id: otherSite.id, path: "/" }, from("DE"));
		await waitFor(() => owner.$fetch<SummaryWithPrevious>(`/api/sites/${otherSite.id}/summary?range=today`), summary => summary.pageviews === 1);
		const otherConnection = await connected(owner, otherSite.id);
		await deliver(otherConnection, paymentPayload({ visitorId, amount: 900, customerId: ALICE_CUSTOMER }));

		expect((await owner.fetch(revenuePath(otherSite.id), { method: "DELETE" })).status).toBe(204);
		expect(await owner.$fetch(revenuePath(otherSite.id))).toEqual({ connection: null });
		expect((await owner.$fetch<SummaryWithPrevious>(`/api/sites/${otherSite.id}/summary?range=today`)).revenue).toBeNull();
		expect((await deliver(otherConnection, paymentPayload({ visitorId, amount: 900, customerId: ALICE_CUSTOMER }))).status).toBe(404);

		const reconnected = await connected(owner, otherSite.id);
		expect(reconnected.webhookUrl).not.toBe(otherConnection.webhookUrl);
		expect((await conversions(owner, otherSite.id)).summary.revenue).toBe(900);
	});
});

describe("Polar webhooks", () => {
	it("records each paid order once, however often Polar redelivers it", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const visitorId = await hit({ site_id: otherSite.id, path: "/" }, from("FR"));
		await waitFor(() => owner.$fetch<SummaryWithPrevious>(`/api/sites/${otherSite.id}/summary?range=today`), summary => summary.pageviews === 1);
		const otherConnection = await connected(owner, otherSite.id);
		const payload = paymentPayload({ visitorId, amount: 4900, customerId: ALICE_CUSTOMER, id: randomUUID() });

		expect((await deliver(otherConnection, payload)).status).toBe(202);
		expect((await deliver(otherConnection, payload)).status).toBe(202);
		const report = await conversions(owner, otherSite.id);
		expect(report.total).toBe(1);
		expect(report.summary).toMatchObject({ revenue: 4900, payments: 1 });
		expect((await owner.$fetch(revenuePath(otherSite.id)) as { connection: RevenueConnection }).connection.lastPaymentAt).toBe(report.rows[0]!.paidAt);
	});

	it("refuses a delivery signed with another secret, and an unknown connection", async () => {
		const payload = paymentPayload({ visitorId: aliceId, amount: 100, customerId: ALICE_CUSTOMER });
		expect((await deliver(connection, payload, "not-the-secret")).status).toBe(401);
		expect((await deliver({ ...connection, webhookUrl: connection.webhookUrl.replace(/[\w-]+$/, randomUUID()) }, payload)).status).toBe(404);
	});

	it("ignores other events, orders without a Visitor id and Visitors of another Site", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const otherVisitorId = await hit({ site_id: otherSite.id, path: "/" }, from("FR"));
		const ignored = [
			{ ...paymentPayload({ visitorId: aliceId, amount: 100, customerId: ALICE_CUSTOMER }), type: "order.created" },
			orderPaidPayload({ productId: PRODUCT_ID, email: "unused@example.com", amount: 100 }),
			paymentPayload({ visitorId: otherVisitorId, amount: 100, customerId: ALICE_CUSTOMER }),
		];
		for (const payload of ignored) {
			expect((await deliver(connection, payload)).status).toBe(202);
		}
		expect((await conversions()).total).toBe(3);
	});
});

describe("the Conversions report", () => {
	it("sums Revenue in the connection's currency, with Payments, order value and time to convert", async () => {
		const { currency, summary } = await conversions();
		expect(currency).toBe("usd");
		expect(summary).toMatchObject({ revenue: 6900, payments: 2, avgOrderValue: 3450 });
		expect(summary.previous).toEqual({ revenue: 0, payments: 0, avgOrderValue: 0, avgTimeToConvertSeconds: null });
		expect(summary.avgTimeToConvertSeconds).toBeGreaterThanOrEqual(60);
	});

	it("breaks Revenue down by the payer's first Source and country", async () => {
		const { sources, countries } = await conversions();
		expect(sources).toEqual([
			{ value: "google.com", referrerDomain: "google.com", revenue: 4900, payments: 1 },
			{ value: "Direct", referrerDomain: "(direct)", revenue: 2000, payments: 1 },
		]);
		expect(countries).toEqual([
			{ value: "CH", revenue: 4900, payments: 1 },
			{ value: "US", revenue: 2000, payments: 1 },
		]);
	});

	it("lists every Payment, newest first, with its Source, country, time to convert and Visits", async () => {
		const { rows, total } = await conversions();
		expect(total).toBe(3);
		expect(rows.map(row => [row.visitorId, row.amount, row.currency])).toEqual(expect.arrayContaining([
			[aliceId, 4900, "usd"],
			[bobId, 2000, "usd"],
			[bobId, 1500, "eur"],
		]));
		const alice = rows.find(row => row.visitorId === aliceId)!;
		expect(alice).toMatchObject({ source: { referrerDomain: "google.com" }, location: { country: "CH" }, visits: 1 });
		expect(alice.timeToConvertSeconds).toBeGreaterThanOrEqual(120);
		expect(alice.timeToConvertSeconds).toBeLessThan(600);
	});

	it("charts Revenue across the Range", async () => {
		const { points } = await conversions();
		expect(points.reduce((sum, point) => sum + point.revenue, 0)).toBe(6900);
		expect(points.reduce((sum, point) => sum + point.payments, 0)).toBe(2);
	});

	it("narrows to Payments of Visitors matching the Filters", async () => {
		const { summary, rows } = await conversions(owner, site.id, `range=today&f=${encodeURIComponent("country:CH")}`);
		expect(summary).toMatchObject({ revenue: 4900, payments: 1 });
		expect(rows.map(row => row.visitorId)).toEqual([aliceId]);
	});

	it("is not on Share links, which never show Payments", async () => {
		const link = await owner.$fetch<ShareLink>(`/api/sites/${site.id}/share-links`, { method: "POST", body: { name: "Investors" } });
		expect((await anonymousFetch(`/api/share/${link.token}/conversions?range=today`)).status).toBe(404);
	});
});

describe("customer emails", () => {
	it("are fetched from Polar when viewed, in full for Admins and masked for Viewers", async () => {
		const { rows } = await conversions();
		const alicePayment = rows.find(row => row.visitorId === aliceId)!;
		const query = rows.map(row => `payment=${row.id}`).join("&");
		const viewer = await addMember(owner, organization.id, "viewer");

		const full = await owner.$fetch<PaymentCustomers>(`/api/sites/${site.id}/payments/customers?${query}`);
		expect(full.masked).toBe(false);
		expect(full.emails[alicePayment.id]).toBe(polarCustomerEmail(ALICE_CUSTOMER));

		const masked = await viewer.$fetch<PaymentCustomers>(`/api/sites/${site.id}/payments/customers?${query}`);
		expect(masked.masked).toBe(true);
		expect(masked.emails[alicePayment.id]).toBe("b***@example.com");
	});

	it("are null for a customer Polar no longer knows, and never stored", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const visitorId = await hit({ site_id: otherSite.id, path: "/" }, from("FR"));
		await waitFor(() => owner.$fetch<SummaryWithPrevious>(`/api/sites/${otherSite.id}/summary?range=today`), summary => summary.pageviews === 1);
		await deliver(await connected(owner, otherSite.id), paymentPayload({ visitorId, amount: 100, customerId: UNKNOWN_POLAR_CUSTOMER_ID }));
		const [payment] = (await conversions(owner, otherSite.id)).rows;

		const customers = await owner.$fetch<PaymentCustomers>(`/api/sites/${otherSite.id}/payments/customers?payment=${payment!.id}`);
		expect(customers.emails).toEqual({ [payment!.id]: null });
		const stored = await testDb.execute({ sql: "SELECT * FROM payments WHERE site_id = ?", args: [otherSite.id] });
		expect(JSON.stringify(stored.rows)).not.toContain("@");
	});
});

describe("the payment journey", () => {
	it("returns the Payment with the payer's journey", async () => {
		const { rows } = await conversions();
		const alicePayment = rows.find(row => row.visitorId === aliceId)!;
		const journey = await owner.$fetch<PaymentJourney>(`/api/sites/${site.id}/payments/${alicePayment.id}`);
		expect(journey.payment).toEqual(alicePayment);
		expect(journey).toMatchObject({ pageviews: 2, events: 0 });
		expect(journey.profile.id).toBe(aliceId);
		expect(journey.profile.journeys[0]!.steps.map(step => step.type === "pageview" && step.path)).toEqual(["/", "/pricing"]);
	});

	it("answers 404 for a Payment of another Site", async () => {
		const otherSite = await createSiteAs(owner, organization);
		const [payment] = (await conversions()).rows;
		expect((await owner.fetch(`/api/sites/${otherSite.id}/payments/${payment!.id}`)).status).toBe(404);
	});
});

describe("Revenue across the dashboard", () => {
	it("joins the summary and the chart once the Site has a connection", async () => {
		const summary = await owner.$fetch<SummaryWithPrevious>(`/api/sites/${site.id}/summary?range=today`);
		expect(summary).toMatchObject({ revenue: 6900, currency: "usd", previous: { revenue: 0 } });
		const { points } = await owner.$fetch<{ points: TimeseriesPoint[] }>(`/api/sites/${site.id}/timeseries?range=today`);
		expect(points.reduce((sum, point) => sum + (point.revenue ?? 0), 0)).toBe(6900);

		const unconnected = await createSiteAs(owner, organization);
		expect(await owner.$fetch<SummaryWithPrevious>(`/api/sites/${unconnected.id}/summary?range=today`)).toMatchObject({ revenue: null, currency: null });
	});

	it("credits each page with the Payments of the Visitors who viewed it", async () => {
		const { rows } = await owner.$fetch<PageStats>(`/api/sites/${site.id}/page-stats?range=today`);
		expect(Object.fromEntries(rows.map(row => [row.path, row.revenue]))).toEqual({ "/": 4900, "/pricing": 4900, "/blog": 2000 });
	});

	it("joins the All sites view", async () => {
		const overview = await owner.$fetch<AllSitesOverview>(`/api/organizations/${organization.id}/overview`);
		const band = overview.sites.find(entry => entry.site.id === site.id)!;
		expect(band).toMatchObject({ revenue: 6900, currency: "usd", previous: { revenue: 0 } });
		expect(overview.totals.revenue).toContainEqual({ currency: "usd", amount: expect.any(Number) });
	});
});
