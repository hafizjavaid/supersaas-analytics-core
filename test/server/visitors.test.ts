import { beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "./setup";
import { $fetch, collect, createSite, fetch, testDb, timezoneAwayFromMidnight, uniqueIp, waitFor, waitForPageviews } from "./helpers";
import type { Hit } from "./helpers";
import type { JourneyStep, Site, VisitorList, VisitorProfile } from "#layers/core/shared/types/analytics";
import { visitorLabel, visitorNumber } from "#layers/core/shared/utils/visitors";

await setupServer();

const DAY = 86_400;
const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function visitor(userAgent: string, country: string, region: string, city: string): Hit {
	return { ip: uniqueIp(), userAgent, headers: { "x-vercel-ip-country": country, "x-vercel-ip-country-region": region, "x-vercel-ip-city": city } };
}

function visitorList(siteId: string, query = "range=today") {
	return $fetch<VisitorList>(`/api/sites/${siteId}/visitors?${query}`);
}

function profile(siteId: string, visitorId: string) {
	return $fetch<VisitorProfile>(`/api/sites/${siteId}/visitors/${visitorId}`);
}

async function hit(body: Record<string, unknown>, from: Hit) {
	const response = await collect(body, from);
	return response.headers.get("sd-visitor")!;
}

function stepsOf(visitorProfile: VisitorProfile): JourneyStep[] {
	return visitorProfile.journeys.flatMap(journey => journey.steps);
}

let site: Site;
let aliceId: string;
let bobId: string;

// alice: Chrome, Bern (CH), from google.com: / for 60 s, then /pricing with a signup Event and an Outbound link
// bob:   Safari, San Francisco (US), direct: /blog
beforeAll(async () => {
	site = await createSite({ domain: "users.example.com", timezone: timezoneAwayFromMidnight() });
	const alice = visitor(CHROME_WINDOWS, "CH", "BE", "Bern");
	const bob = visitor(SAFARI_IPHONE, "US", "CA", "San%20Francisco");

	aliceId = await hit({ site_id: site.id, path: "/", title: "Home", referrer: "https://www.google.com/" }, alice);
	await waitForPageviews(site.id, 1);
	await hit({ site_id: site.id, path: "/pricing", title: "Pricing" }, alice);
	bobId = await hit({ site_id: site.id, path: "/blog" }, bob);
	await waitForPageviews(site.id, 3);
	await hit({ site_id: site.id, name: "signup", props: { plan: "pro" }, path: "/pricing" }, alice);
	await hit({ site_id: site.id, outbound_url: "https://github.com/supersaas" }, alice);
	await waitFor(() => profile(site.id, aliceId), found => stepsOf(found).length === 4);

	const pricing = await testDb.execute({ sql: "SELECT timestamp FROM pages WHERE site_id = ? AND path = '/pricing'", args: [site.id] });
	const entryAt = Number(pricing.rows[0]!.timestamp) - 60;
	await testDb.batch([
		{ sql: "UPDATE pages SET timestamp = ? WHERE site_id = ? AND path = '/'", args: [entryAt, site.id] },
		{ sql: "UPDATE visits SET started_at = ? WHERE visitor_id = ?", args: [entryAt, aliceId] },
	]);
	await arrangeIdentifiedVisitors();
});

describe("visitor list", () => {
	it("summarises Visitors, Pageviews, views per Visitor and average time", async () => {
		const { summary } = await visitorList(site.id);
		expect(summary).toMatchObject({ visitors: 2, pageviews: 3, viewsPerVisitor: 1.5 });
		expect(summary.avgTimeSeconds).toBe(30);
	});

	it("lists each Visitor with a label, country, Source, device, Visits, Pageviews, time and entry to exit", async () => {
		const { rows, total } = await visitorList(site.id);
		expect(total).toBe(2);
		expect(rows.map(row => row.id).sort()).toEqual([aliceId, bobId].sort());

		const alice = rows.find(row => row.id === aliceId)!;
		expect(alice).toMatchObject({
			label: visitorLabel(aliceId),
			identified: false,
			location: { country: "CH", region: "BE", city: "Bern" },
			source: { channel: "search", referrerDomain: "google.com" },
			device: { browser: "Chrome", os: "Windows", deviceType: "desktop" },
			visits: 1,
			pageviews: 2,
			durationSeconds: 60,
			entryPage: "/",
			exitPage: "/pricing",
		});
		expect(rows.find(row => row.id === bobId)).toMatchObject({
			location: { country: "US" },
			source: { channel: "direct", referrerDomain: "(direct)" },
			device: { browser: "Safari", deviceType: "mobile" },
			pageviews: 1,
			durationSeconds: 0,
			entryPage: "/blog",
			exitPage: "/blog",
		});
	});

	it("lists the Visitor seen most recently first", async () => {
		const { rows } = await visitorList(site.id);
		expect(rows[0]!.lastSeen).toBeGreaterThanOrEqual(rows[1]!.lastSeen);
	});

	it("searches by visitor id, label, country and page without narrowing the summary", async () => {
		const searchFor = async (term: string) => {
			const list = await visitorList(site.id, `range=today&q=${encodeURIComponent(term)}`);
			expect(list.summary.visitors, term).toBe(2);
			return list.rows.map(row => row.id);
		};

		expect(await searchFor(aliceId.slice(0, 10))).toEqual([aliceId]);
		expect(await searchFor(visitorLabel(bobId))).toContain(bobId);
		expect(await searchFor(visitorNumber(aliceId))).toContain(aliceId);
		expect(await searchFor("switzerland")).toEqual([aliceId]);
		expect(await searchFor("US")).toEqual([bobId]);
		expect(await searchFor("/pric")).toEqual([aliceId]);
		expect(await searchFor("/nowhere")).toEqual([]);
	});

	it("narrows to the Visitors with a Visit matching the Filters", async () => {
		const list = await visitorList(site.id, `range=today&f=${encodeURIComponent("country:US")}`);
		expect(list.summary).toMatchObject({ visitors: 1, pageviews: 1 });
		expect(list.rows.map(row => row.id)).toEqual([bobId]);
	});

	it("is empty for a Site without traffic", async () => {
		const empty = await createSite();
		expect(await visitorList(empty.id)).toEqual(expect.objectContaining({
			summary: { visitors: 0, pageviews: 0, viewsPerVisitor: 0, avgTimeSeconds: 0 },
			rows: [],
			total: 0,
		}));
	});
});

describe("visitor profile", () => {
	it("totals the Visitor's day and names its first Source", async () => {
		const alice = await profile(site.id, aliceId);
		expect(alice).toMatchObject({
			id: aliceId,
			label: visitorLabel(aliceId),
			identified: false,
			totals: { days: 1, visits: 1, pageviews: 2, events: 1, outboundLinks: 1, durationSeconds: 60 },
			firstVisit: { source: { channel: "search", referrerDomain: "google.com" } },
		});
		expect(alice.journeys).toHaveLength(1);
		expect(alice.journeys[0]).toMatchObject({ visitorId: aliceId, location: { country: "CH" }, device: { browser: "Chrome" } });
		expect(alice.journeys[0]!.visits).toEqual([expect.objectContaining({ pageviews: 2, entryPage: "/", exitPage: "/pricing" })]);
	});

	it("orders Pageviews, Events and Outbound links in a timeline with time on page and the entry page marked", async () => {
		const [journey] = (await profile(site.id, aliceId)).journeys;
		const visitId = journey!.visits[0]!.id;
		expect(journey!.steps[0]).toEqual(expect.objectContaining({ type: "pageview", visitId, path: "/", title: "Home", entry: true, timeOnPageSeconds: 60 }));
		expect(journey!.steps.slice(1)).toEqual(expect.arrayContaining([
			expect.objectContaining({ type: "pageview", visitId, path: "/pricing", entry: false, timeOnPageSeconds: null }),
			expect.objectContaining({ type: "event", visitId, name: "signup", path: "/pricing", props: { plan: "pro" } }),
			expect.objectContaining({ type: "outbound", visitId, url: "https://github.com/supersaas" }),
		]));
		const timestamps = journey!.steps.map(step => step.timestamp);
		expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
	});

	it("answers 404 for an unknown Visitor and for a Visitor of another Site", async () => {
		expect((await fetch(`/api/sites/${site.id}/visitors/unknown`)).status).toBe(404);
		const other = await createSite();
		expect((await fetch(`/api/sites/${other.id}/visitors/${aliceId}`)).status).toBe(404);
	});
});

// Moves one Visitor's raw rows back by whole days, as if it were seen on an earlier day.
async function moveVisitorBack(visitorId: string, days: number) {
	const seconds = days * DAY;
	const ofVisitor = "SELECT id FROM visits WHERE visitor_id = ?";
	await testDb.batch([
		{ sql: `UPDATE pages SET timestamp = timestamp - ? WHERE visit_id IN (${ofVisitor})`, args: [seconds, visitorId] },
		{ sql: `UPDATE events SET timestamp = timestamp - ? WHERE visit_id IN (${ofVisitor})`, args: [seconds, visitorId] },
		{ sql: "UPDATE outbound_links SET timestamp = timestamp - ? WHERE visitor_id = ?", args: [seconds, visitorId] },
		{ sql: "UPDATE visits SET started_at = started_at - ?, ended_at = ended_at - ? WHERE visitor_id = ?", args: [seconds, seconds, visitorId] },
		{ sql: "UPDATE visitors SET first_seen = first_seen - ?, last_seen = last_seen - ? WHERE id = ?", args: [seconds, seconds, visitorId] },
	]);
}

let identifiedSite: Site;
let yesterdayId: string;
let todayId: string;
let strangerId: string;

// The same person on two days is two Visitors (ADR 0002), and identify() links them by its hash.
async function arrangeIdentifiedVisitors() {
	identifiedSite = await createSite({ timezone: timezoneAwayFromMidnight() });
	const earlier = { ip: uniqueIp() };
	const later = { ip: uniqueIp() };
	const stranger = { ip: uniqueIp() };

	yesterdayId = await hit({ site_id: identifiedSite.id, path: "/docs" }, earlier);
	todayId = await hit({ site_id: identifiedSite.id, path: "/" }, later);
	strangerId = await hit({ site_id: identifiedSite.id, path: "/about" }, stranger);
	await waitForPageviews(identifiedSite.id, 3);
	await hit({ site_id: identifiedSite.id, identify: "user-42" }, earlier);
	await hit({ site_id: identifiedSite.id, identify: "user-42" }, later);
	await hit({ site_id: identifiedSite.id, identify: "user-7" }, stranger);
	await waitFor(() => visitorList(identifiedSite.id), list => list.rows.filter(row => row.identified).length === 3);
	await moveVisitorBack(yesterdayId, 1);
}

describe("identified visitors", () => {
	it("lists journeys from every day sharing the identify hash, newest first", async () => {
		const today = await profile(identifiedSite.id, todayId);
		expect(today.identified).toBe(true);
		expect(today.journeys.map(journey => journey.visitorId)).toEqual([todayId, yesterdayId]);
		expect(today.totals).toMatchObject({ days: 2, visits: 2, pageviews: 2 });
		expect(today.journeys[1]!.steps[0]).toMatchObject({ type: "pageview", path: "/docs", entry: true });
		expect(today.journeys[0]!.firstSeen - today.journeys[1]!.firstSeen).toBeGreaterThanOrEqual(DAY);
		expect(today.firstVisit!.startedAt).toBe(today.journeys[1]!.visits[0]!.startedAt);

		const yesterday = await profile(identifiedSite.id, yesterdayId);
		expect(yesterday.journeys.map(journey => journey.visitorId)).toEqual([todayId, yesterdayId]);
		expect(yesterday.label).toBe(today.label);
	});

	it("keeps an Identified visitor's label across days and leaves other identities out", async () => {
		const { label } = await profile(identifiedSite.id, todayId);
		const stranger = await profile(identifiedSite.id, strangerId);
		expect(stranger.journeys.map(journey => journey.visitorId)).toEqual([strangerId]);
		expect(stranger.label).not.toBe(label);

		const week = await visitorList(identifiedSite.id, "range=7d");
		expect(week.rows.filter(row => row.label === label).map(row => row.id).sort()).toEqual([todayId, yesterdayId].sort());
		expect(week.rows.every(row => row.identified)).toBe(true);
		expect((await visitorList(identifiedSite.id)).rows.map(row => row.id)).not.toContain(yesterdayId);
	});
});
