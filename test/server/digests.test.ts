import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { addMember, anonymous$fetch, anonymousFetch, collect, createOrganization, createSiteAs, serverUrl, signUp, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor } from "./helpers";
import type { TestOrganization, TestUser } from "./helpers";
import { readOutbox } from "./accounts";
import { FAKE_ANTHROPIC_URL } from "./anthropic";
import type { Site, Summary } from "#layers/core/shared/types/analytics";
import type { Digest, DigestSubscription } from "#layers/core/shared/types/digests";
import { formatDateInTz, shiftDate } from "#layers/core/shared/utils/dates";

await setupServer();

const DAY = 86_400;

function subscriptionsPath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/digest-subscriptions`;
}

function subscribe(user: TestUser, organization: TestOrganization, siteId: string, frequency: string) {
	return user.fetch(`${subscriptionsPath(organization)}/${siteId}`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ frequency }),
	});
}

function sendDigests(user: TestUser, date: string) {
	return user.$fetch<{ result: { digests: number; emails: number } }>("/_nitro/tasks/digests:send", { method: "POST", body: { payload: { date } } });
}

async function digestEmailsTo(user: TestUser) {
	return (await readOutbox(serverUrl(), user.email)).filter(sent => sent.template === "digest");
}

function lastModelRequest() {
	return fetch(`${FAKE_ANTHROPIC_URL}/last-request`).then(response => response.json()) as Promise<{ model: string; messages: { content: unknown }[] }>;
}

// Moves the Site's raw rows back, keeping the time of day, then rolls up the day they land on.
async function moveRowsBack(siteId: string, days: number) {
	const seconds = days * DAY;
	await testDb.batch([
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE site_id = ?", args: [seconds, seconds, siteId] },
		{ sql: "UPDATE pages SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
		{ sql: "UPDATE events SET timestamp = timestamp - ? WHERE site_id = ?", args: [seconds, siteId] },
	]);
}

function rollUp(user: TestUser, date: string) {
	return user.$fetch("/_nitro/tasks/rollup:daily", { method: "POST", body: { payload: { date } } });
}

async function visit(siteId: string, paths: string[], referrer?: string) {
	const ip = uniqueIp();
	for (const path of paths) {
		await collect({ site_id: siteId, path, ...(referrer && paths.indexOf(path) === 0 ? { referrer } : {}) }, { ip });
	}
}

function lastSundayBefore(today: string) {
	let date = shiftDate(today, -1);
	while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) {
		date = shiftDate(date, -1);
	}
	return date;
}

function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (DAY * 1000));
}

let owner: TestUser;
let viewer: TestUser & { memberId: string };
let quiet: TestUser & { memberId: string };
let organization: TestOrganization;
let site: Site;
let quietSite: Site;
let sunday: string;
let digests: Digest[];

async function waitForPageviews(pageviews: number) {
	await waitFor(
		() => owner.$fetch<Summary>(`/api/sites/${site.id}/summary?range=today`),
		summary => summary.pageviews >= pageviews,
	);
}

beforeAll(async () => {
	owner = await signUp("digest-owner");
	organization = await createOrganization(owner);
	viewer = await addMember(owner, organization.id, "viewer");
	quiet = await addMember(owner, organization.id, "admin");
	const timezone = timezoneAwayFromMidnight();
	site = await createSiteAs(owner, organization, { timezone });
	await owner.$fetch(`/api/sites/${site.id}/goals`, { method: "POST", body: { name: "Saw pricing", kind: "page", value: "/pricing" } });

	const today = formatDateInTz(new Date(), timezone);
	sunday = lastSundayBefore(today);

	// The week before: two Visitors from Google on the home page.
	await visit(site.id, ["/"], "https://www.google.com/");
	await visit(site.id, ["/"], "https://www.google.com/");
	await waitForPageviews(2);
	await moveRowsBack(site.id, 7);

	// The week itself: one from Google, three from Hacker News who see the pricing page.
	await visit(site.id, ["/"], "https://www.google.com/");
	await visit(site.id, ["/pricing"], "https://news.ycombinator.com/");
	await visit(site.id, ["/pricing"], "https://news.ycombinator.com/");
	await visit(site.id, ["/pricing"], "https://news.ycombinator.com/");
	await waitForPageviews(4);
	await moveRowsBack(site.id, daysBetween(sunday, today));

	await rollUp(owner, shiftDate(sunday, -7));
	await rollUp(owner, sunday);

	quietSite = await createSiteAs(owner, organization);
	await subscribe(owner, organization, site.id, "weekly");
	await subscribe(viewer, organization, site.id, "daily");
	await subscribe(quiet, organization, site.id, "off");
	await sendDigests(owner, sunday);
	digests = await owner.$fetch<Digest[]>(`/api/sites/${site.id}/digests`);
});

describe("choosing Digests", () => {
	it("lists every Site of the Organization, off until chosen", async () => {
		const subscriptions = await viewer.$fetch<DigestSubscription[]>(subscriptionsPath(organization));
		expect(subscriptions).toContainEqual({ siteId: quietSite.id, siteName: quietSite.name, siteDomain: quietSite.domain, frequency: "off" });
	});

	it("keeps each Member's choice per Site", async () => {
		expect((await subscribe(owner, organization, quietSite.id, "monthly")).status).toBe(200);
		expect((await subscribe(viewer, organization, quietSite.id, "daily")).status).toBe(200);

		const mine = await owner.$fetch<DigestSubscription[]>(subscriptionsPath(organization));
		expect(mine.find(subscription => subscription.siteId === quietSite.id)?.frequency).toBe("monthly");
		const theirs = await viewer.$fetch<DigestSubscription[]>(subscriptionsPath(organization));
		expect(theirs.find(subscription => subscription.siteId === quietSite.id)?.frequency).toBe("daily");

		expect((await subscribe(owner, organization, quietSite.id, "off")).status).toBe(200);
		const after = await owner.$fetch<DigestSubscription[]>(subscriptionsPath(organization));
		expect(after.find(subscription => subscription.siteId === quietSite.id)?.frequency).toBe("off");
	});

	it("refuses an unknown frequency and another Organization's Site", async () => {
		expect((await subscribe(owner, organization, quietSite.id, "hourly")).status).toBe(400);
		const stranger = await signUp("digest-stranger");
		const otherSite = await createSiteAs(stranger, await createOrganization(stranger));
		expect((await subscribe(owner, organization, otherSite.id, "daily")).status).toBe(404);
	});
});

describe("sending Digests", () => {
	it("builds the week's key figures against the week before", () => {
		const weekly = digests.find(digest => digest.frequency === "weekly")!;
		expect(weekly).toMatchObject({ fromDate: shiftDate(sunday, -6), toDate: sunday });
		expect(weekly.report.figures).toMatchObject({
			visitors: { current: 4, previous: 2 },
			pageviews: { current: 4, previous: 2 },
			conversionRate: { current: 0.75, previous: 0 },
			revenue: null,
		});
	});

	it("lists the top movers in Pages and Sources, and the new Sources", () => {
		const { report } = digests.find(digest => digest.frequency === "weekly")!;
		expect(report.pages).toEqual([
			{ label: "/pricing", current: 3, previous: 0 },
			{ label: "/", current: 1, previous: 2 },
		]);
		expect(report.sources).toEqual([
			{ label: "news.ycombinator.com", current: 3, previous: 0 },
			{ label: "google.com", current: 1, previous: 2 },
		]);
		expect(report.newSources).toEqual([{ label: "news.ycombinator.com", visits: 3 }]);
		expect(report.goals).toEqual([{ name: "Saw pricing", conversions: { current: 3, previous: 0 } }]);
	});

	it("puts a summary from Haiku on top, written from the figures", async () => {
		const weekly = digests.find(digest => digest.frequency === "weekly")!;
		expect(weekly.summary).toMatch(/^You asked: /);
		expect(weekly.summary).toContain("Visitors: 4 (previous period 2)");
		expect((await lastModelRequest()).model).toBe("claude-haiku-5-5");
	});

	it("builds a daily Digest only because a Member receives it", () => {
		const daily = digests.find(digest => digest.frequency === "daily")!;
		expect(daily).toMatchObject({ fromDate: sunday, toDate: sunday });
		expect(daily.report.figures.visitors).toEqual({ current: 4, previous: 0 });
	});

	it("emails each Member the Digest they chose, with a link to unsubscribe", async () => {
		const [weekly] = await digestEmailsTo(owner);
		expect(weekly).toMatchObject({ props: { frequency: "weekly", siteName: site.name } });
		expect(weekly!.props.url).toMatch(new RegExp(`/app/${organization.slug}/sites/${site.id}/insights\\?digest=`));
		expect(weekly!.props.unsubscribeUrl).toMatch(/\/digests\/unsubscribe\?token=/);
		expect(weekly!.html).toContain("news.ycombinator.com");

		expect((await digestEmailsTo(viewer)).map(email => email.props.frequency)).toEqual(["daily"]);
		expect(await digestEmailsTo(quiet)).toEqual([]);
	});

	it("never builds or emails the same Digest twice", async () => {
		await sendDigests(owner, sunday);
		expect(await owner.$fetch<Digest[]>(`/api/sites/${site.id}/digests`)).toHaveLength(digests.length);
		expect(await digestEmailsTo(owner)).toHaveLength(1);
	});

	it("renders the Digest on the Insights page", async () => {
		const weekly = digests.find(digest => digest.frequency === "weekly")!;
		const html = await (await viewer.fetch(`/app/${organization.slug}/sites/${site.id}/insights?digest=${weekly.id}`)).text();
		expect(html).toContain("news.ycombinator.com");
		expect(html).toContain("Saw pricing");
	});

	it("shows the Insights list only to Members", async () => {
		expect(await viewer.$fetch<Digest[]>(`/api/sites/${site.id}/digests`)).toHaveLength(digests.length);
		const stranger = await signUp("digest-outsider");
		expect((await stranger.fetch(`/api/sites/${site.id}/digests`)).status).toBe(404);
	});
});

describe("unsubscribing", () => {
	it("turns off that Site's Digest for that Member without signing in", async () => {
		const [email] = await digestEmailsTo(viewer);
		const token = new URL(String(email!.props.unsubscribeUrl)).searchParams.get("token");
		const result = await anonymous$fetch<{ siteName: string }>("/api/digests/unsubscribe", { method: "POST", body: { token } });
		expect(result.siteName).toBe(site.name);

		const subscriptions = await viewer.$fetch<DigestSubscription[]>(subscriptionsPath(organization));
		expect(subscriptions.find(subscription => subscription.siteId === site.id)?.frequency).toBe("off");
		expect((await owner.$fetch<DigestSubscription[]>(subscriptionsPath(organization))).find(subscription => subscription.siteId === site.id)?.frequency).toBe("weekly");
	});

	it("asks for a click before unsubscribing, so a mail scanner opening the link changes nothing", async () => {
		const html = await anonymous$fetch<string>("/digests/unsubscribe?token=anything");
		expect(html).toContain("Unsubscribe");
	});

	it("refuses a forged token", async () => {
		const response = await anonymousFetch("/api/digests/unsubscribe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: `${viewer.memberId}.${site.id}.forged` }),
		});
		expect(response.status).toBe(400);
	});
});
