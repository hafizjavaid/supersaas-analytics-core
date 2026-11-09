import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { visitorLabel } from "#layers/core/shared/utils/visitors";
import { addMember, anonymous$fetch, anonymousFetch, collect, createOrganization, createSiteAs, postAs, serverUrl, signUp, uniqueIp, waitFor } from "./helpers";
import { orderPaidPayload, signedWebhookHeaders, TEST_SITE_POLAR_TOKEN } from "./polar";
import type { RevenueConnection } from "#layers/core/shared/types/revenue";

await setupServer();

const MARKETING_THEME_BODY = /<body[^>]*class="[^"]*\bmarketing-theme\b/;

describe("app", () => {
	it("serves the sign-in page", async () => {
		const html = await anonymous$fetch<string>("/auth/login");
		expect(html).toMatch(/^<!DOCTYPE html>/);
	});

	it.each(["/auth/login", "/auth/sign-up", "/auth/magic-link", "/auth/forgot-password", "/auth/reset-password"])("renders %s in the marketing theme", async (path) => {
		const html = await anonymous$fetch<string>(path);
		expect(html).toMatch(MARKETING_THEME_BODY);
	});

	it("keeps onboarding, which shares the auth card, in the app's theme", async () => {
		const user = await signUp();
		const html = await (await user.fetch("/app/onboard")).text();
		expect(html).not.toMatch(MARKETING_THEME_BODY);
	});

	it("keeps the redirect on the sign-in page's links", async () => {
		const html = await anonymous$fetch<string>("/auth/login?redirect=/app/acme");
		expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/);
		expect(html).toContain("href=\"/auth/sign-up?redirect=/app/acme\"");
		expect(html).toContain("href=\"/auth/magic-link?redirect=/app/acme\"");
		expect(html).toContain("href=\"/auth/forgot-password\"");
	});

	it("keeps the redirect on the sign-up page's link to sign in", async () => {
		const html = await anonymous$fetch<string>("/auth/sign-up?redirect=/app/acme");
		expect(html).toMatch(/<h1[^>]*>Create an account<\/h1>/);
		expect(html).toContain("href=\"/auth/login?redirect=/app/acme\"");
	});

	it("sends a signed-out visitor from the dashboard to sign in", async () => {
		const response = await anonymousFetch("/app", { redirect: "manual" });
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/auth/login?redirect=/app");
	});

	it("sends a signed-in user without an Organization to onboarding", async () => {
		const user = await signUp();
		const response = await user.fetch("/app", { redirect: "manual" });
		expect(response.headers.get("location")).toBe("/app/onboard");
		expect((await user.fetch("/app/onboard")).status).toBe(200);
	});

	it("lands a member on their Organization's dashboard", async () => {
		const user = await signUp();
		const organization = await createOrganization(user);

		const response = await user.fetch("/app", { redirect: "manual" });
		expect(response.headers.get("location")).toBe(`/app/${organization.slug}`);
		expect((await user.fetch(`/app/${organization.slug}`)).status).toBe(200);
	});

	it("sends a signed-in user away from the sign-in page", async () => {
		const user = await signUp();
		const response = await user.fetch("/auth/login", { redirect: "manual" });
		expect(response.headers.get("location")).toBe("/app");
	});

	it("answers 404 for another Organization's dashboard", async () => {
		const organization = await createOrganization(await signUp());
		const stranger = await signUp();
		expect((await stranger.fetch(`/app/${organization.slug}`)).status).toBe(404);
	});

	it("renders a Site's dashboard and every settings page for a Viewer", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		for (const path of [
			`/app/${organization.slug}`,
			sitePath,
			`${sitePath}?range=7d`,
			`${sitePath}/conversions`,
			`${sitePath}/search?range=7d`,
			`${sitePath}/ask`,
			`${sitePath}/insights`,
			`/app/${organization.slug}/search`,
			`/app/${organization.slug}/ask`,
			...["", "/attribution", "/sharing", "/privacy", "/integrations", "/filtering", "/danger"].map(section => `${sitePath}/settings${section}`),
			...["", "/members", "/digests", "/danger"].map(section => `/app/${organization.slug}/settings${section}`),
		]) {
			expect((await viewer.fetch(path)).status, path).toBe(200);
		}
	});

	it("shows the Site header, the tracking code and the Members", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization, { timezone: "Europe/London" });
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const dashboard = await (await owner.fetch(sitePath)).text();
		expect(dashboard).toContain(site.domain);
		expect(dashboard).toMatch(/Times in GMT(\+1)? · Europe\/London/);
		expect(dashboard).toContain(`href="${sitePath}/settings"`);
		expect(dashboard).toContain(`href="${sitePath}/live"`);
		expect(await (await owner.fetch(`${sitePath}/settings`)).text()).toContain(`&lt;script defer data-site=&quot;${site.id}&quot; src=&quot;${serverUrl()}/sd.js&quot;&gt;&lt;/script&gt;`);
		expect(await (await owner.fetch(`/app/${organization.slug}/settings/members`)).text()).toContain(owner.email);
		expect(await (await owner.fetch(`/app/${organization.slug}`)).text()).toContain(site.name);
	});

	it("shows All sites with the combined totals and a band per Site linking to it", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitFor(
			() => owner.$fetch<{ totals: { pageviews: number } }>(`/api/organizations/${organization.id}/overview`),
			overview => overview.totals.pageviews === 1,
		);

		const page = await (await owner.fetch(`/app/${organization.slug}`)).text();
		expect(page).toContain("All your sites");
		expect(page).toContain("Add a website");
		expect(page).toContain(`href="/app/${organization.slug}/sites/${site.id}"`);
		expect(page).toContain(site.domain);
		expect(page).toContain("1 online");
		expect(page).toContain("Visitors · 24h");
		expect(page).toContain("+1");
		expect(page).toContain("Visitors per hour over the last 24 hours");
	});

	it("shows an empty All sites with Add a website to an Owner and not to a Viewer", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const viewer = await addMember(owner, organization.id, "viewer");

		const ownerPage = await (await owner.fetch(`/app/${organization.slug}`)).text();
		expect(ownerPage).toContain("No websites yet");
		expect(ownerPage).toContain("Add a website");
		const viewerPage = await (await viewer.fetch(`/app/${organization.slug}`)).text();
		expect(viewerPage).toContain("No websites yet");
		expect(viewerPage).not.toContain("Add a website");
	});

	it("shows the chosen Range and the KPI strip that toggles chart series", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const dashboard = await (await owner.fetch(`${sitePath}?range=24h`)).text();
		expect(dashboard).toContain("Last 24 hours");
		for (const label of ["Visitors", "Pageviews", "Bounce rate", "Visit duration"]) {
			expect(dashboard).toContain(label);
		}
		expect(dashboard).toContain("aria-pressed=\"true\"");
		expect(dashboard).toContain("aria-pressed=\"false\"");

		const custom = await (await owner.fetch(`${sitePath}?range=custom&from=2026-01-01&to=2026-01-31`)).text();
		expect(custom).toMatch(/Jan 1\s*–\s*31, 2026/);
	});

	it("shows the Filters from the URL as removable chips", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const dashboard = await (await owner.fetch(`${sitePath}?f=country:PK&f=${encodeURIComponent("city:US-San Francisco")}`)).text();
		expect(dashboard).toContain("aria-label=\"Filters\"");
		expect(dashboard).toContain("Pakistan");
		expect(dashboard).toContain("San Francisco, United States");
		expect(dashboard).toContain("aria-label=\"Remove Country filter\"");
		expect(dashboard).toContain("Clear all");

		expect(await (await owner.fetch(sitePath)).text()).not.toContain("aria-label=\"Filters\"");
	});

	it("shows the Sources tabs and a Channel Filter chip", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const dashboard = await (await owner.fetch(`${sitePath}?f=channel:ai&f=ai_assistant:chatgpt.com`)).text();
		for (const tab of ["Channel", "Referrer", "AI", "Campaign", "UTM", "Outbound"]) {
			expect(dashboard).toContain(`>${tab}<`);
		}
		expect(dashboard).toContain("aria-label=\"Remove Channel filter\"");
		expect(dashboard).toContain("AI assistant");
		expect(dashboard).toContain("ChatGPT");
	});

	it("shows each Event with the page it fired on as a row that opens its breakdown", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const visitor = { ip: uniqueIp() };
		await collect({ site_id: site.id, path: "/" }, visitor);
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);
		await collect({ site_id: site.id, name: "signup", path: "/pricing", props: { plan: "pro" } }, visitor);
		await waitFor(() => owner.$fetch<{ rows: unknown[] }>(`/api/sites/${site.id}/activity?range=today`), response => response.rows.length === 1);

		const dashboard = await (await owner.fetch(`/app/${organization.slug}/sites/${site.id}?range=today`)).text();
		expect(dashboard).toContain("title=\"Break down signup\"");
		expect(dashboard).toMatch(/class="[^"]*font-mono[^"]*">\/pricing</);
	});

	it("shows Goals settings with Quick add chips to an Owner and the list alone to a Viewer", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		expect((await postAs(owner, `/api/sites/${site.id}/goals`, { kind: "page", value: "/thank-you", name: "Thank you page" })).status).toBe(201);
		const attributionPath = `/app/${organization.slug}/sites/${site.id}/settings/attribution`;

		const ownerPage = await (await owner.fetch(attributionPath)).text();
		for (const label of ["Quick add, no code", "WhatsApp leads", "Phone clicks", "Email clicks", "Form submits", "Outbound clicks", "Custom goal", "Thank you page", "Visited /thank-you"]) {
			expect(ownerPage, label).toContain(label);
		}
		const viewerPage = await (await viewer.fetch(attributionPath)).text();
		expect(viewerPage).toContain("Thank you page");
		expect(viewerPage).not.toContain("Quick add, no code");
		expect(viewerPage).not.toContain("Remove Thank you page");
	});

	it("shows the Goals card and the Conversion rate KPI once a Site has a Goal", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const empty = await (await owner.fetch(sitePath)).text();
		expect(empty).toContain("No goals yet");
		expect(empty).toContain(`href="${sitePath}/settings/attribution"`);
		expect(empty).not.toContain("Conversion rate");

		expect((await postAs(owner, `/api/sites/${site.id}/goals`, { kind: "event", value: "signup", name: "Signups" })).status).toBe(201);
		const dashboard = await (await owner.fetch(sitePath)).text();
		expect(dashboard).toContain("Conversion rate");
		expect(dashboard).toContain("title=\"Filter by Signups\"");

		const filtered = await (await owner.fetch(`${sitePath}?f=${encodeURIComponent("goal:event:signup")}`)).text();
		expect(filtered).toContain("aria-label=\"Remove Goal filter\"");
		expect(filtered).toContain("title=\"Stop filtering by Signups\"");
	});

	it("shows the Funnels page and dashboard preview, with the builder only for Owners and Admins", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const viewer = await addMember(owner, organization.id, "viewer");
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;

		const empty = await (await owner.fetch(sitePath)).text();
		expect(empty).toContain("No funnels yet");
		expect(empty).toContain("Create a funnel");
		expect(empty).toContain(`href="${sitePath}/funnels"`);

		const funnel = { name: "Pricing to signup", window: "24h", steps: [{ kind: "page", value: "/" }, { kind: "page", value: "/pricing", label: "Pricing" }] };
		expect((await postAs(owner, `/api/sites/${site.id}/funnels`, funnel)).status).toBe(201);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);

		const dashboard = await (await owner.fetch(`${sitePath}?range=today`)).text();
		for (const label of ["Pricing to signup", "24 hours window", "2 steps · 100.0% of all visitors entered", "Entered", "Completed", "Conv. rate", "↓ 0.0% continue · 1 dropped", "All funnels →"]) {
			expect(dashboard, label).toContain(label);
		}
		expect(dashboard).toContain(`href="${sitePath}/funnels?range=today"`);

		const ownerPage = await (await owner.fetch(`${sitePath}/funnels?range=today`)).text();
		for (const label of ["New funnel", "Edit Pricing to signup", "Pricing", "Funnel steps"]) {
			expect(ownerPage, label).toContain(label);
		}
		const viewerPage = await (await viewer.fetch(`${sitePath}/funnels`)).text();
		expect(viewerPage).toContain("Pricing to signup");
		expect(viewerPage).not.toContain("New funnel");
		expect(viewerPage).not.toContain("Edit Pricing to signup");
	});

	it("renders the Journeys explorer with its columns and Events, and links to it from a Funnel", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const visitor = { ip: uniqueIp() };
		await collect({ site_id: site.id, path: "/" }, visitor);
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);
		await collect({ site_id: site.id, path: "/blog/launch" }, visitor);
		await collect({ site_id: site.id, name: "share", path: "/blog/launch" }, visitor);
		await waitFor(
			() => owner.$fetch<{ events: { rows: unknown[] } }>(`/api/sites/${site.id}/journeys?range=today&path=/&path=/blog/launch`),
			journeys => journeys.events.rows.length === 1,
		);

		const sitePath = `/app/${organization.slug}/sites/${site.id}`;
		const empty = await (await owner.fetch(`${sitePath}/journeys?range=today`)).text();
		for (const label of ["Journeys", "Starting point", "Select a starting point", `href="${sitePath}/journeys?range=today"`]) {
			expect(empty, label).toContain(label);
		}

		const page = await (await owner.fetch(`${sitePath}/journeys?range=today&path=/&path=/blog/launch`)).text();
		for (const label of ["1 step after", "2 steps after", "No further action", "Unselect /blog/launch", "Events on", "share"]) {
			expect(page, label).toContain(label);
		}
		expect(page).toContain("aria-pressed=\"true\"");

		const funnel = { name: "Home to blog", window: "24h", steps: [{ kind: "page", value: "/" }, { kind: "page", value: "/blog/*" }] };
		expect((await postAs(owner, `/api/sites/${site.id}/funnels`, funnel)).status).toBe(201);
		const funnels = await (await owner.fetch(`${sitePath}/funnels?range=today`)).text();
		expect(funnels).toContain("Explore journeys");
		expect(funnels).toContain(`href="${sitePath}/journeys?range=today&amp;path=/"`);
	});

	it("renders the Pages tab with its summary, search and sortable table, keeping the Range in the rail", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		await collect({ site_id: site.id, path: "/pricing", title: "Pricing plans" }, { ip: uniqueIp() });
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);

		const sitePath = `/app/${organization.slug}/sites/${site.id}`;
		const page = await (await owner.fetch(`${sitePath}/pages?range=today&f=${encodeURIComponent("country:CH")}`)).text();
		for (const label of ["Pages", "Pageviews", "Visits", "Avg. bounce", "Avg. duration", "Trending", "Search pages", "Sort by Views", "Sort by Duration"]) {
			expect(page, label).toContain(label);
		}
		expect(page).toContain(">URL<");
		expect(page).toContain("Remove Country filter");
		expect(page).toContain(`href="${sitePath}/pages?range=today&amp;f=country:CH"`);

		const unfiltered = await (await owner.fetch(`${sitePath}/pages?range=today`)).text();
		expect(unfiltered).toContain("Pricing plans");
		expect(unfiltered).toMatch(/font-mono[^"]*">\/pricing</);
	});

	it("renders the Conversions page, Revenue across the dashboard, and the Polar settings", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const sitePath = `/app/${organization.slug}/sites/${site.id}`;
		expect(await (await owner.fetch(`${sitePath}/conversions`)).text()).toContain("No Revenue provider yet");

		const response = await collect({ site_id: site.id, path: "/pricing" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } });
		const visitorId = response.headers.get("sd-visitor")!;
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);
		const connection = await owner.$fetch<RevenueConnection>(`/api/sites/${site.id}/revenue`, {
			method: "PUT",
			body: { provider: "polar", environment: "sandbox", accessToken: TEST_SITE_POLAR_TOKEN, currency: "usd" },
		});
		const body = JSON.stringify(orderPaidPayload({ productId: "product", email: "unused@example.com", amount: 4900, metadata: { sd_visitor_id: visitorId } }));
		await anonymousFetch(new URL(connection.webhookUrl).pathname, { method: "POST", headers: signedWebhookHeaders(body, connection.webhookSecret!), body });

		const page = await (await owner.fetch(`${sitePath}/conversions?range=today`)).text();
		for (const label of ["Revenue", "Payments", "Avg. order value", "Avg. time to convert", "Revenue by Source", "Revenue by country", "Customers", "$49", "Switzerland"]) {
			expect(page, label).toContain(label);
		}
		expect(await (await owner.fetch(`${sitePath}?range=today`)).text()).toMatch(/Revenue<\/span>[\s\S]*?\$49/);
		expect(await (await owner.fetch(`${sitePath}/pages?range=today`)).text()).toContain("Revenue");

		const settings = await (await owner.fetch(`${sitePath}/settings/attribution`)).text();
		expect(settings).toContain(connection.webhookUrl);
		expect(settings).not.toContain(TEST_SITE_POLAR_TOKEN);
	});

	it("renders the Users page with its summary, search and a row per Visitor", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		const response = await collect({ site_id: site.id, path: "/pricing" }, { ip: uniqueIp(), headers: { "x-vercel-ip-country": "CH" } });
		const visitorId = response.headers.get("sd-visitor")!;
		await waitFor(() => owner.$fetch<{ pageviews: number }>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);

		const sitePath = `/app/${organization.slug}/sites/${site.id}`;
		const page = await (await owner.fetch(`${sitePath}/users?range=today`)).text();
		for (const label of ["Visitors", "Pageviews", "Views per Visitor", "Avg. time", "Search visitor id, country or page", "Entry → Exit", visitorLabel(visitorId), "Switzerland"]) {
			expect(page, label).toContain(label);
		}
		expect(page).toMatch(/font-mono[^"]*">\s*\/pricing → \/pricing/);
		expect(page).toContain(`href="${sitePath}/users?range=today"`);
	});

	it("renders the Live page across Sites and per Site, and links to them from All sites and the Realtime card", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization, { name: "Live shop" });
		const bern = { "x-vercel-ip-country": "CH", "x-vercel-ip-city": "Bern", "x-vercel-ip-latitude": "46.95", "x-vercel-ip-longitude": "7.45" };
		await collect({ site_id: site.id, path: "/pricing", referrer: "https://www.google.com/" }, { ip: uniqueIp(), headers: bern });
		await waitFor(
			() => owner.$fetch<{ visitors: unknown[] }>(`/api/organizations/${organization.id}/realtime`),
			realtime => realtime.visitors.length === 1,
		);
		const organizationPath = `/app/${organization.slug}`;
		const sitePath = `${organizationPath}/sites/${site.id}`;

		const live = await (await owner.fetch(`${organizationPath}/live`)).text();
		for (const label of ["Live across your sites", "1 live", "Pageviews · last 30 minutes", "Referrers", "google.com", "Countries", "Switzerland", "Devices", "Desktop", "Bern, Switzerland", "Live shop", "Pageviews per minute over the last 30 minutes"]) {
			expect(live, label).toContain(label);
		}
		expect(live).toMatch(/font-mono[^"]*">\/pricing</);

		const siteLive = await (await owner.fetch(`${sitePath}/live`)).text();
		expect(siteLive).toContain("1 live");
		expect(siteLive).toContain("Bern, Switzerland");

		expect(await (await owner.fetch(organizationPath)).text()).toContain(`href="${organizationPath}/live"`);
		const dashboard = await (await owner.fetch(sitePath)).text();
		expect(dashboard).toContain("Realtime");
		expect(dashboard).toContain("View realtime →");
	});

	it("lists a Site's excluded IPs and paths on the Filtering settings", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization);
		await owner.$fetch(`/api/sites/${site.id}`, { method: "PATCH", body: { excludedIps: ["192.0.2.0/24"], excludedPaths: ["/admin/*"] } });

		const page = await (await owner.fetch(`/app/${organization.slug}/sites/${site.id}/settings/filtering`)).text();
		expect(page).toContain("Ignore internal traffic");
		expect(page).toContain("Add my current IP");
		expect(page).toContain("192.0.2.0/24");
		expect(page).toContain("/admin/*");
	});

	it("answers 404 for a Site in another Organization, even under the member's own Organization", async () => {
		const owner = await signUp();
		const site = await createSiteAs(owner, await createOrganization(owner));
		const stranger = await signUp();
		const strangerOrganization = await createOrganization(stranger);

		expect((await stranger.fetch(`/app/${strangerOrganization.slug}/sites/${site.id}`)).status).toBe(404);
	});

	it("renders a Share link's dashboard without signing in, and none of the Member-only rail items", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization, { name: "Shared Shop" });
		const link = await (await postAs(owner, `/api/sites/${site.id}/share-links`, { name: "Investors" })).json() as { token: string };

		const response = await anonymousFetch(`/share/${link.token}?range=7d`);
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain("Shared Shop");
		expect(html).toContain("View only");
		expect(html).toContain(`/share/${link.token}/pages?range=7d`);
		expect(html).not.toContain(`/share/${link.token}/users`);
		expect(html).not.toContain("/settings");
	});

	it("asks for the password of a protected Share link and answers 404 to an unknown one", async () => {
		const owner = await signUp();
		const organization = await createOrganization(owner);
		const site = await createSiteAs(owner, organization, { name: "Secret Shop" });
		const link = await (await postAs(owner, `/api/sites/${site.id}/share-links`, { name: "Agency", password: "s3cret-pass" })).json() as { token: string };

		const html = await (await anonymousFetch(`/share/${link.token}`)).text();
		expect(html).toContain("This dashboard is protected");
		expect(html).not.toContain("Secret Shop");
		expect((await anonymousFetch("/share/not-a-real-token")).status).toBe(404);
	});
});
