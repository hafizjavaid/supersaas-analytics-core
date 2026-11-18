import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { anonymousFetch, collect, createOrganization, createSiteAs, postAs, signUp, timezoneAwayFromMidnight, uniqueIp, waitFor } from "./helpers";
import type { Hit, TestOrganization, TestUser } from "./helpers";
import { orderPaidPayload, signedWebhookHeaders, TEST_SITE_POLAR_TOKEN } from "./polar";
import type { ApiV1FunnelReport, ApiV1Funnels, ApiV1Goals, ApiV1Live, ApiV1Payments, ApiV1Sites, ApiV1Summary, ApiV1Timeseries, ApiV1TopList } from "#layers/core/shared/schemas/api-v1";
import type { Funnel, Goal, Site } from "#layers/core/shared/types/analytics";
import { shiftDate } from "#layers/core/shared/utils/dates";
import type { CreatedApiKey } from "#layers/core/shared/types/api-keys";
import type { RevenueConnection } from "#layers/core/shared/types/revenue";

await setupServer();

let owner: TestUser;
let organization: TestOrganization;
let site: Site;
let key: string;
let goal: Goal;
let funnel: Funnel;
let otherSite: Site;
let otherFunnel: Funnel;

async function createKey(user: TestUser, organizationId: string) {
	const response = await postAs(user, `/api/organizations/${organizationId}/api-keys`, { name: "Tests" });
	expect(response.status).toBe(201);
	return (await response.json() as CreatedApiKey).key;
}

function v1(path: string, apiKey = key) {
	return anonymousFetch(`/api/v1${path}`, { headers: { authorization: `Bearer ${apiKey}` } });
}

async function v1Json<T>(path: string) {
	const response = await v1(path);
	expect(response.status, await response.clone().text()).toBe(200);
	return await response.json() as T;
}

async function created<T>(response: Response) {
	expect(response.status, await response.clone().text()).toBe(201);
	return await response.json() as T;
}

function sitePath(path: string, siteId = site.id) {
	return `/sites/${siteId}${path}`;
}

const pricingFunnel = { name: "Pricing", window: "24h", steps: [{ kind: "page", value: "/", label: "Home" }, { kind: "page", value: "/pricing", label: "" }] };

// alice: CH, from google.com, / then /pricing, signs up and pays $49
// bob:   US, direct, /blog
beforeAll(async () => {
	owner = await signUp("owner");
	organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization, { name: "Docs", domain: "docs.example.com", timezone: timezoneAwayFromMidnight() });
	key = await createKey(owner, organization.id);

	const alice: Hit = { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } };
	const bob: Hit = { ip: uniqueIp(), headers: { "x-vercel-ip-country": "US" } };
	const aliceId = (await collect({ site_id: site.id, path: "/", referrer: "https://www.google.com/" }, alice)).headers.get("sd-visitor")!;
	await collect({ site_id: site.id, path: "/pricing" }, alice);
	await collect({ site_id: site.id, name: "signup", path: "/pricing" }, alice);
	await collect({ site_id: site.id, path: "/blog" }, bob);
	await waitFor(() => v1Json<ApiV1Summary>(sitePath("/summary?range=today")), summary => summary.current.pageviews === 3);

	goal = await created<Goal>(await postAs(owner, `/api/sites/${site.id}/goals`, { kind: "page", value: "/pricing" }));
	funnel = await created<Funnel>(await postAs(owner, `/api/sites/${site.id}/funnels`, pricingFunnel));

	const connectResponse = await owner.fetch(`/api/sites/${site.id}/revenue`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "polar", environment: "sandbox", accessToken: TEST_SITE_POLAR_TOKEN, currency: "usd" }),
	});
	expect(connectResponse.status).toBe(200);
	const connection = await connectResponse.json() as RevenueConnection;
	const payment = JSON.stringify(orderPaidPayload({ productId: "88888888-8888-4888-8888-888888888888", email: "alice@example.com", amount: 4900, metadata: { sd_visitor_id: aliceId } }));
	const delivered = await anonymousFetch(new URL(connection.webhookUrl).pathname, { method: "POST", headers: signedWebhookHeaders(payment, connection.webhookSecret!), body: payment });
	expect(delivered.status).toBe(202);

	const stranger = await signUp("stranger");
	const strangerOrganization = await createOrganization(stranger);
	otherSite = await createSiteAs(stranger, strangerOrganization);
	otherFunnel = await created<Funnel>(await postAs(stranger, `/api/sites/${otherSite.id}/funnels`, pricingFunnel));
});

describe("authentication", () => {
	it("refuses a request without a key", async () => {
		expect((await anonymousFetch("/api/v1/sites")).status).toBe(401);
		expect((await anonymousFetch(`/api/v1${sitePath("/summary")}`)).status).toBe(401);
	});

	it("does not let a session cookie stand in for a key", async () => {
		expect((await owner.fetch("/api/v1/sites")).status).toBe(401);
	});

	it("answers 404 for every report of another Organization's Site", async () => {
		for (const report of ["/summary", "/timeseries", "/top/page", "/goals", "/funnels", `/funnels/${otherFunnel.id}`, "/payments", "/live"]) {
			expect((await v1(sitePath(report, otherSite.id))).status, report).toBe(404);
		}
		expect((await v1(sitePath("/summary", "no-such-site"))).status).toBe(404);
	});
});

describe("GET /api/v1/sites", () => {
	it("lists only the key's Organization's Sites", async () => {
		expect(await v1Json<ApiV1Sites>("/sites")).toEqual({
			sites: [{ id: site.id, name: "Docs", domain: "docs.example.com", timezone: site.timezone, createdAt: site.createdAt }],
		});
	});
});

describe("reading a Range and Filters", () => {
	it("defaults to the last 30 days", async () => {
		const summary = await v1Json<ApiV1Summary>(sitePath("/summary"));
		expect(summary.range).toEqual({ from: shiftDate(summary.range.to, -29), to: summary.range.to, hours: null });
		expect(summary.current.pageviews).toBe(3);
	});

	it("reads a custom Range from from and to", async () => {
		const summary = await v1Json<ApiV1Summary>(sitePath("/summary?range=custom&from=2024-01-01&to=2024-01-31"));
		expect(summary.range).toEqual({ from: "2024-01-01", to: "2024-01-31", hours: null });
		expect(summary.current.pageviews).toBe(0);
	});

	it("answers 400 for an unknown Range, a custom Range without dates, or an unreadable Filter", async () => {
		expect((await v1(sitePath("/summary?range=forever"))).status).toBe(400);
		expect((await v1(sitePath("/summary?range=custom&from=2024-01-01"))).status).toBe(400);
		expect((await v1(sitePath("/summary?range=custom&from=yesterday&to=2024-01-31"))).status).toBe(400);
		expect((await v1(sitePath("/summary?f=planet:Mars"))).status).toBe(400);
		expect((await v1(sitePath("/summary?f=country:CH&f=nonsense"))).status).toBe(400);
	});
});

describe("GET /api/v1/sites/:id/summary", () => {
	it("gives the totals and the previous period in the v1 shape", async () => {
		const summary = await v1Json<ApiV1Summary>(sitePath("/summary?range=today"));
		expect(summary).toMatchObject({
			site: { id: site.id, name: "Docs", domain: "docs.example.com" },
			currency: "usd",
			current: { visitors: 2, visits: 2, pageviews: 3, bounceRate: 0.5, conversionRate: 0.5, revenue: 4900 },
			previous: { visitors: 0, pageviews: 0, revenue: 0 },
		});
		expect(Object.keys(summary.current).sort()).toEqual(["avgVisitDurationSeconds", "bounceRate", "conversionRate", "pageviews", "revenue", "visitors", "visits"]);
	});

	it("narrows to the Visits matching a Filter", async () => {
		const summary = await v1Json<ApiV1Summary>(sitePath("/summary?range=today&f=country:US"));
		expect(summary.current).toMatchObject({ visitors: 1, pageviews: 1 });
	});
});

describe("GET /api/v1/sites/:id/timeseries", () => {
	it("gives hourly points for a single day", async () => {
		const series = await v1Json<ApiV1Timeseries>(sitePath("/timeseries?range=today"));
		expect(series.interval).toBe("hour");
		expect(series.points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(3);
		expect(Object.keys(series.points[0]!).sort()).toEqual(["pageviews", "timestamp", "visitors"]);
	});

	it("gives daily points for longer Ranges, narrowed by a Filter", async () => {
		const series = await v1Json<ApiV1Timeseries>(sitePath("/timeseries?range=7d&f=country:CH"));
		expect(series.interval).toBe("day");
		expect(series.points).toHaveLength(7);
		expect(series.points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(2);
	});
});

describe("GET /api/v1/sites/:id/top/:dimension", () => {
	it("ranks a Dimension's values", async () => {
		const pages = await v1Json<ApiV1TopList>(sitePath("/top/page?range=today"));
		expect(pages).toMatchObject({ dimension: "page", metric: "pageviews", total: 3 });
		expect(pages.rows).toEqual(expect.arrayContaining([{ label: "/", value: 1 }, { label: "/pricing", value: 1 }, { label: "/blog", value: 1 }]));

		const countries = await v1Json<ApiV1TopList>(sitePath("/top/country?range=today"));
		expect(countries).toMatchObject({ metric: "visits", total: 2 });
		expect(countries.rows.map(row => row.label).sort()).toEqual(["CH", "US"]);
	});

	it("narrows to the Visits matching a Filter", async () => {
		const pages = await v1Json<ApiV1TopList>(sitePath("/top/page?range=today&f=country:CH"));
		expect(pages.rows.map(row => row.label).sort()).toEqual(["/", "/pricing"]);
	});

	it("answers 404 for an unknown Dimension", async () => {
		expect((await v1(sitePath("/top/planet?range=today"))).status).toBe(404);
	});
});

describe("GET /api/v1/sites/:id/goals", () => {
	it("gives each Goal's conversions", async () => {
		expect(await v1Json<ApiV1Goals>(sitePath("/goals?range=today"))).toMatchObject({
			visitors: 2,
			converted: 1,
			conversionRate: 0.5,
			goals: [{ id: goal.id, name: goal.name, kind: "page", value: "/pricing", conversions: 1, visitors: 1, conversionRate: 0.5 }],
		});
	});

	it("narrows to the Visits matching a Filter", async () => {
		expect(await v1Json<ApiV1Goals>(sitePath("/goals?range=today&f=country:US"))).toMatchObject({ visitors: 1, converted: 0 });
	});
});

describe("GET /api/v1/sites/:id/funnels", () => {
	it("lists the Site's Funnels", async () => {
		expect(await v1Json<ApiV1Funnels>(sitePath("/funnels"))).toEqual({
			site: { id: site.id, name: "Docs", domain: "docs.example.com" },
			funnels: [{ id: funnel.id, name: "Pricing", window: "24h", steps: [{ kind: "page", value: "/", label: "Home" }, { kind: "page", value: "/pricing", label: "" }] }],
		});
	});

	it("gives one Funnel's steps and conversion, narrowed by a Filter", async () => {
		const report = await v1Json<ApiV1FunnelReport>(sitePath(`/funnels/${funnel.id}?range=today`));
		expect(report).toMatchObject({ funnel: { id: funnel.id, name: "Pricing" }, visitors: 2, entered: 1, completed: 1, conversionRate: 1 });
		expect(report.steps.map(step => [step.label, step.visitors])).toEqual([["Home", 1], ["/pricing", 1]]);

		const filtered = await v1Json<ApiV1FunnelReport>(sitePath(`/funnels/${funnel.id}?range=today&f=country:CH`));
		expect(filtered).toMatchObject({ visitors: 1, entered: 1, completed: 1 });
	});

	it("answers 404 for a Funnel of another Site", async () => {
		expect((await v1(sitePath(`/funnels/${otherFunnel.id}`))).status).toBe(404);
	});
});

describe("GET /api/v1/sites/:id/payments", () => {
	it("gives totals and breakdowns, never individual Payments or customers", async () => {
		const payments = await v1Json<ApiV1Payments>(sitePath("/payments?range=today"));
		expect(payments).toMatchObject({
			currency: "usd",
			current: { revenue: 4900, payments: 1, avgOrderValue: 4900 },
			previous: { revenue: 0, payments: 0 },
			countries: [{ value: "CH", revenue: 4900, payments: 1 }],
		});
		expect(Object.keys(payments).sort()).toEqual(["countries", "currency", "current", "previous", "range", "site", "sources"]);
		expect(JSON.stringify(payments)).not.toContain("alice@example.com");
	});

	it("narrows to the Payments of Visitors matching a Filter", async () => {
		const payments = await v1Json<ApiV1Payments>(sitePath("/payments?range=today&f=country:US"));
		expect(payments.current).toMatchObject({ revenue: 0, payments: 0 });
	});

	it("answers 404 when the Site has no Revenue connection", async () => {
		const plainSite = await createSiteAs(owner, organization);
		expect((await v1(sitePath("/payments", plainSite.id))).status).toBe(404);
	});
});

describe("GET /api/v1/sites/:id/live", () => {
	it("counts the Live visitors", async () => {
		expect(await v1Json<ApiV1Live>(sitePath("/live"))).toEqual({ site: { id: site.id, name: "Docs", domain: "docs.example.com" }, visitors: 2 });
	});
});
