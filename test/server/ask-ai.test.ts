import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, collect, createOrganization, createSiteAs, signUp, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { FAKE_ANTHROPIC_URL } from "./anthropic";
import type { Site, Summary } from "#layers/core/shared/types/analytics";
import type { AiConversation, AiConversationList, AiConversationWithMessages } from "#layers/core/shared/types/ai";

await setupServer();

function aiPath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/ai`;
}

async function startConversation(user: TestUser, organization: TestOrganization, siteId?: string) {
	return user.$fetch<AiConversation>(`${aiPath(organization)}/conversations`, { method: "POST", body: siteId ? { siteId } : {} });
}

function ask(user: TestUser, organization: TestOrganization, conversationId: string, text: string) {
	return user.fetch(`${aiPath(organization)}/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ conversationId, message: { text } }),
	});
}

// The answer arrives as the AI SDK's UI message stream; its text deltas are JSON strings inside it.
async function answerOf(response: Response) {
	expect(response.status).toBe(200);
	return response.text();
}

async function askAndRead(text: string, siteId?: string) {
	const conversation = await startConversation(owner, organization, siteId);
	return answerOf(await ask(owner, organization, conversation.id, text));
}

function lastModelRequest() {
	return fetch(`${FAKE_ANTHROPIC_URL}/last-request`).then(response => response.json()) as Promise<{ model: string; tools: { name: string }[] }>;
}

let owner: TestUser;
let organization: TestOrganization;
let site: Site;
let otherSite: Site;

beforeAll(async () => {
	owner = await signUp("ai-owner");
	organization = await createOrganization(owner);
	site = await createSiteAs(owner, organization);
	const stranger = await signUp("ai-stranger");
	otherSite = await createSiteAs(stranger, await createOrganization(stranger));
});

describe("asking a question", () => {
	it("streams the answer and keeps the conversation for the Member who asked", async () => {
		const conversation = await startConversation(owner, organization);
		expect(await answerOf(await ask(owner, organization, conversation.id, "How many visitors came today?"))).toContain("You asked: How many visitors came today?");

		const stored = await waitFor(
			() => owner.$fetch<AiConversationWithMessages>(`${aiPath(organization)}/conversations/${conversation.id}`),
			current => current.messages.length === 2,
		);
		expect(stored.title).toBe("How many visitors came today?");
		expect(stored.messages.map(message => message.role)).toEqual(["user", "assistant"]);
		expect(JSON.stringify(stored.messages[1]!.parts)).toContain("You asked: How many visitors came today?");

		const list = await owner.$fetch<AiConversationList>(`${aiPath(organization)}/conversations`);
		expect(list.conversations.map(entry => entry.id)).toContain(conversation.id);
		expect(list.allowance).toEqual({ used: 0, limit: null, left: null });
	});

	it("keeps each Member's conversations to themselves", async () => {
		const conversation = await startConversation(owner, organization);
		const admin = await addMember(owner, organization.id, "admin");
		expect((await admin.fetch(`${aiPath(organization)}/conversations/${conversation.id}`)).status).toBe(404);
		expect((await ask(admin, organization, conversation.id, "Peek")).status).toBe(404);
		expect((await admin.$fetch<AiConversationList>(`${aiPath(organization)}/conversations`)).conversations).toEqual([]);
	});

	it("lets Viewers ask, but not people outside the Organization", async () => {
		const viewer = await addMember(owner, organization.id, "viewer");
		const conversation = await startConversation(viewer, organization);
		expect(await answerOf(await ask(viewer, organization, conversation.id, "Hi"))).toContain("You asked: Hi");
		const stranger = await signUp("ai-outsider");
		expect((await stranger.fetch(`${aiPath(organization)}/conversations`)).status).toBe(404);
	});

	it("asks Sonnet with the analytics tools and no Revenue tool before a Revenue connection", async () => {
		await askAndRead("Which tools?");
		const request = await lastModelRequest();
		expect(request.model).toBe("claude-sonnet-5-5");
		expect(request.tools.map(entry => entry.name).sort()).toEqual(["funnel", "goals", "listSites", "summary", "timeseries", "topList"]);
	});

	it("keeps a Site's conversations apart from the Organization's", async () => {
		const conversation = await startConversation(owner, organization, site.id);
		expect((await owner.$fetch<AiConversationList>(`${aiPath(organization)}/conversations?site=${site.id}`)).conversations.map(entry => entry.id)).toEqual([conversation.id]);
		expect((await owner.$fetch<AiConversationList>(`${aiPath(organization)}/conversations`)).conversations.map(entry => entry.id)).not.toContain(conversation.id);
		expect((await owner.fetch(`${aiPath(organization)}/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: otherSite.id }) })).status).toBe(404);
	});
});

describe("the tools", () => {
	it("list only the Organization's Sites", async () => {
		const answer = await askAndRead("call listSites");
		expect(answer).toContain(site.id);
		expect(answer).not.toContain(otherSite.id);
	});

	it("read the Organization's own Site", async () => {
		await collect({ site_id: site.id, path: "/" }, { ip: uniqueIp() });
		await waitFor(() => owner.$fetch<Summary>(`/api/sites/${site.id}/summary?range=today`), summary => summary.pageviews === 1);
		const answer = await askAndRead(`call summary ${JSON.stringify({ siteId: site.id, range: "today" })}`);
		expect(answer).toContain(String.raw`\"pageviews\":1`);
	});

	it("refuse another Organization's Site", async () => {
		for (const name of ["summary", "timeseries", "goals"]) {
			const answer = await askAndRead(`call ${name} ${JSON.stringify({ siteId: otherSite.id, range: "7d" })}`);
			expect(answer).toContain(`Site not found: ${otherSite.id}`);
		}
		const topList = await askAndRead(`call topList ${JSON.stringify({ siteId: otherSite.id, range: "7d", dimension: "country" })}`);
		expect(topList).toContain("Site not found");
	});
});
