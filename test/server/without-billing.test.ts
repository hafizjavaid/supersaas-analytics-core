import { describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { anonymousFetch, collect, createOrganization, createSiteAs, postAs, signUp, testDb, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";
import type { Summary } from "#layers/core/shared/types/analytics";
import type { AiConversation, AiConversationList } from "#layers/core/shared/types/ai";

await setupServer();

const DAY = 86_400_000;

async function ownedOrganization() {
	const owner = await signUp("owner");
	return { owner, organization: await createOrganization(owner) };
}

// The column stays in core's schema (ADR 0008), so a database that once ran Hosted can still hold an ended Trial.
function endTrial(organization: TestOrganization, daysAgo: number) {
	return testDb.execute({ sql: "UPDATE organization SET trial_ends_at = ? WHERE id = ?", args: [Date.now() - daysAgo * DAY, organization.id] });
}

function thisMonth() {
	return new Date().toISOString().slice(0, 7);
}

function usageRowsOf(organization: TestOrganization) {
	return testDb.execute({ sql: "SELECT used, ai_questions FROM organization_usage WHERE organization_id = ?", args: [organization.id] })
		.then(result => result.rows.map(row => ({ used: Number(row.used), aiQuestions: Number(row.ai_questions) })));
}

function pageviewsOf(owner: TestUser, siteId: string) {
	return waitFor(() => owner.$fetch<Summary>(`/api/sites/${siteId}/summary?range=today`), result => result.pageviews > 0)
		.then(summary => summary.pageviews);
}

function addSite(owner: TestUser, organization: TestOrganization, domain = `blog-${crypto.randomUUID()}.example.com`) {
	return owner.fetch(`/api/organizations/${organization.id}/sites`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "Blog", domain }),
	});
}

describe("core without the Hosted layer", () => {
	it("shows no billing on an Organization", async () => {
		const { owner, organization } = await ownedOrganization();
		const membership = await owner.$fetch<OrganizationMembership>(`/api/organizations/${organization.id}`);
		expect(membership).not.toHaveProperty("billing");
		expect(membership).not.toHaveProperty("usage");
		expect(membership).not.toHaveProperty("subscriptionTier");
	});

	it("collects every hit without counting usage, even past Hosted's Quota ceiling", async () => {
		const { owner, organization } = await ownedOrganization();
		const site = await createSiteAs(owner, organization);
		await testDb.execute({ sql: "INSERT INTO organization_usage (organization_id, month, used) VALUES (?, ?, ?)", args: [organization.id, thisMonth(), 10_000_000] });

		const visitor = { ip: uniqueIp() };
		await collect({ site_id: site.id, path: "/" }, visitor);
		await collect({ site_id: site.id, name: "Signup" }, visitor);

		expect(await pageviewsOf(owner, site.id)).toBe(1);
		expect(await usageRowsOf(organization)).toEqual([{ used: 10_000_000, aiQuestions: 0 }]);
	});

	it("answers every Ask AI question without a limit or a count", async () => {
		const { owner, organization } = await ownedOrganization();
		await testDb.execute({ sql: "INSERT INTO organization_usage (organization_id, month, ai_questions) VALUES (?, ?, ?)", args: [organization.id, thisMonth(), 10_000] });
		const aiPath = `/api/organizations/${organization.id}/ai`;
		const conversation = await owner.$fetch<AiConversation>(`${aiPath}/conversations`, { method: "POST", body: {} });

		const answer = await owner.fetch(`${aiPath}/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ conversationId: conversation.id, message: { text: "One more?" } }),
		});

		expect(answer.status).toBe(200);
		expect(await answer.text()).toContain("You asked: One more?");
		expect((await owner.$fetch<AiConversationList>(`${aiPath}/conversations`)).allowance).toEqual({ used: 0, limit: null, left: null });
		expect(await usageRowsOf(organization)).toEqual([{ used: 0, aiQuestions: 10_000 }]);
	});

	it("keeps an Organization writable and collecting whatever its Trial columns say", async () => {
		const { owner, organization } = await ownedOrganization();
		await endTrial(organization, 30);

		expect((await addSite(owner, organization)).status).toBe(201);
		const site = await createSiteAs(owner, organization);
		expect((await postAs(owner, `/api/sites/${site.id}/goals`, { kind: "outbound" })).status).toBe(201);
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		const summary = await waitFor(() => owner.$fetch<Summary>(`/api/sites/${site.id}/summary?range=today`), result => result.pageviews === 1);
		expect(summary.pageviews).toBe(1);
	});

	it("lets two Organizations add the same domain", async () => {
		const domain = `shop-${crypto.randomUUID()}.example.com`;
		const first = await ownedOrganization();
		const second = await ownedOrganization();
		expect((await addSite(first.owner, first.organization, domain)).status).toBe(201);
		expect((await addSite(second.owner, second.organization, domain)).status).toBe(201);
	});

	it("answers 404 to checkout, the customer portal, Polar's webhook and the Billing page", async () => {
		const { owner, organization } = await ownedOrganization();
		expect((await postAs(owner, "/api/auth/checkout", { slug: "launch-monthly", referenceId: organization.id, redirect: false })).status).toBe(404);
		expect((await postAs(owner, "/api/auth/customer/portal", { redirect: false })).status).toBe(404);
		expect((await anonymousFetch("/api/auth/polar/webhooks", { method: "POST", body: "{}" })).status).toBe(404);
		expect((await owner.fetch(`/app/${organization.slug}/billing`)).status).toBe(404);
	});
});
