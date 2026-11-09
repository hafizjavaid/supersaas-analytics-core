import { shiftDate, startOfDayUtcMs } from "#layers/core/shared/utils/dates";
import { expectedCtr } from "#layers/core/shared/utils/search";

// Dictionaries and weights match analytics-main's scripts/seed-demo-data.mjs; locations gain coordinates for the globe.

interface Weighted {
	weight: number;
}

export interface DemoSource extends Weighted {
	referrerDomain: string;
	utmSource: string;
	utmMedium: string;
	utmCampaign: string;
	utmTerm?: string;
	utmContent?: string;
}

export interface DemoDevice extends Weighted {
	browser: string;
	os: string;
	deviceType: string;
}

export interface DemoLocation extends Weighted {
	country: string;
	region: string;
	city: string;
	latitude: number;
	longitude: number;
}

interface DemoPage extends Weighted {
	path: string;
	title: string;
}

const REFERRERS: DemoSource[] = [
	{ referrerDomain: "(direct)", utmSource: "", utmMedium: "", utmCampaign: "", weight: 30 },
	{ referrerDomain: "google.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 26 },
	{ referrerDomain: "github.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 9 },
	{ referrerDomain: "news.ycombinator.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 7 },
	{ referrerDomain: "t.co", utmSource: "", utmMedium: "", utmCampaign: "", weight: 5 },
	{ referrerDomain: "reddit.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 5 },
	{ referrerDomain: "producthunt.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 4 },
	{ referrerDomain: "linkedin.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 3 },
	{ referrerDomain: "bing.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 3 },
	{ referrerDomain: "dev.to", utmSource: "", utmMedium: "", utmCampaign: "", weight: 3 },
	{ referrerDomain: "facebook.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 2 },
	{ referrerDomain: "chatgpt.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 4 },
	{ referrerDomain: "(direct)", utmSource: "chatgpt.com", utmMedium: "", utmCampaign: "", weight: 2 },
	{ referrerDomain: "perplexity.ai", utmSource: "", utmMedium: "", utmCampaign: "", weight: 2 },
	{ referrerDomain: "claude.ai", utmSource: "", utmMedium: "", utmCampaign: "", weight: 1 },
	{ referrerDomain: "gemini.google.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 1 },
	{ referrerDomain: "mail.google.com", utmSource: "", utmMedium: "", utmCampaign: "", weight: 1 },
	{ referrerDomain: "(direct)", utmSource: "newsletter", utmMedium: "email", utmCampaign: "weekly-digest", utmContent: "header-link", weight: 2 },
	{ referrerDomain: "(direct)", utmSource: "newsletter", utmMedium: "email", utmCampaign: "weekly-digest", utmContent: "footer-link", weight: 2 },
	{ referrerDomain: "twitter.com", utmSource: "twitter", utmMedium: "social", utmCampaign: "launch", weight: 3 },
	{ referrerDomain: "linkedin.com", utmSource: "linkedin", utmMedium: "social", utmCampaign: "product-update", weight: 3 },
	{ referrerDomain: "google.com", utmSource: "google", utmMedium: "cpc", utmCampaign: "summer-launch", utmTerm: "web analytics", utmContent: "ad-a", weight: 2 },
	{ referrerDomain: "google.com", utmSource: "google", utmMedium: "cpc", utmCampaign: "summer-launch", utmTerm: "cookieless analytics", utmContent: "ad-b", weight: 1 },
	{ referrerDomain: "producthunt.com", utmSource: "product-hunt", utmMedium: "referral", utmCampaign: "launch-day", weight: 2 },
];

const DEVICES: DemoDevice[] = [
	{ browser: "Chrome", os: "Windows", deviceType: "desktop", weight: 30 },
	{ browser: "Chrome", os: "macOS", deviceType: "desktop", weight: 18 },
	{ browser: "Safari", os: "macOS", deviceType: "desktop", weight: 12 },
	{ browser: "Safari", os: "iOS", deviceType: "mobile", weight: 14 },
	{ browser: "Chrome", os: "Android", deviceType: "mobile", weight: 10 },
	{ browser: "Firefox", os: "Windows", deviceType: "desktop", weight: 6 },
	{ browser: "Edge", os: "Windows", deviceType: "desktop", weight: 5 },
	{ browser: "Safari", os: "iOS", deviceType: "tablet", weight: 3 },
	{ browser: "Samsung Internet", os: "Android", deviceType: "mobile", weight: 2 },
];

const LOCATIONS: DemoLocation[] = [
	{ country: "US", region: "CA", city: "San Francisco", latitude: 37.7749, longitude: -122.4194, weight: 14 },
	{ country: "US", region: "NY", city: "New York", latitude: 40.7128, longitude: -74.006, weight: 12 },
	{ country: "US", region: "TX", city: "Austin", latitude: 30.2672, longitude: -97.7431, weight: 8 },
	{ country: "US", region: "WA", city: "Seattle", latitude: 47.6062, longitude: -122.3321, weight: 6 },
	{ country: "GB", region: "", city: "London", latitude: 51.5072, longitude: -0.1276, weight: 10 },
	{ country: "IN", region: "KA", city: "Bangalore", latitude: 12.9716, longitude: 77.5946, weight: 9 },
	{ country: "IN", region: "MH", city: "Mumbai", latitude: 19.076, longitude: 72.8777, weight: 5 },
	{ country: "DE", region: "BE", city: "Berlin", latitude: 52.52, longitude: 13.405, weight: 7 },
	{ country: "CA", region: "ON", city: "Toronto", latitude: 43.6532, longitude: -79.3832, weight: 6 },
	{ country: "AU", region: "NSW", city: "Sydney", latitude: -33.8688, longitude: 151.2093, weight: 5 },
	{ country: "NL", region: "", city: "Amsterdam", latitude: 52.3676, longitude: 4.9041, weight: 4 },
	{ country: "FR", region: "", city: "Paris", latitude: 48.8566, longitude: 2.3522, weight: 4 },
	{ country: "JP", region: "", city: "Tokyo", latitude: 35.6762, longitude: 139.6503, weight: 4 },
	{ country: "BR", region: "SP", city: "Sao Paulo", latitude: -23.5505, longitude: -46.6333, weight: 4 },
	{ country: "SG", region: "", city: "Singapore", latitude: 1.3521, longitude: 103.8198, weight: 3 },
];

const PAGES: DemoPage[] = [
	{ path: "/", title: "SuperSaaS – Ship your SaaS faster", weight: 35 },
	{ path: "/pricing", title: "Pricing – SuperSaaS", weight: 15 },
	{ path: "/docs", title: "Docs – SuperSaaS", weight: 12 },
	{ path: "/docs/getting-started", title: "Getting Started – SuperSaaS", weight: 10 },
	{ path: "/blog", title: "Blog – SuperSaaS", weight: 8 },
	{ path: "/blog/how-we-built-supersaas", title: "How we built SuperSaaS", weight: 6 },
	{ path: "/changelog", title: "Changelog – SuperSaaS", weight: 5 },
	{ path: "/about", title: "About – SuperSaaS", weight: 5 },
	{ path: "/contact", title: "Contact – SuperSaaS", weight: 4 },
];

interface DemoEventRule {
	name: string;
	pages: string[];
	chance: number;
	props?: () => Record<string, string>;
}

const EVENT_RULES: DemoEventRule[] = [
	{ name: "signup", pages: ["/pricing", "/"], chance: 0.06, props: () => ({ plan: pick(["free", "free", "pro", "team"]), cycle: pick(["monthly", "yearly"]) }) },
	{ name: "pricing_click", pages: ["/"], chance: 0.08, props: () => ({ location: pick(["hero", "navbar", "footer"]) }) },
	{ name: "docs_search", pages: ["/docs", "/docs/getting-started"], chance: 0.12, props: () => ({ query: pick(["install", "api key", "webhooks", "pricing", "self-host"]) }) },
	{ name: "newsletter_subscribe", pages: ["/blog", "/"], chance: 0.04 },
	{ name: "cta_click", pages: ["/", "/pricing"], chance: 0.1, props: () => ({ button: pick(["Start free trial", "Book a demo"]) }) },
	{ name: "Email click", pages: ["/contact", "/about"], chance: 0.15 },
	{ name: "Phone click", pages: ["/contact"], chance: 0.08 },
	{ name: "WhatsApp click", pages: ["/contact", "/pricing"], chance: 0.05 },
	{ name: "Form submit", pages: ["/contact", "/blog"], chance: 0.1 },
];

const OUTBOUND_LINKS = [
	{ url: "https://github.com/supersaas", weight: 35 },
	{ url: "https://docs.cloudflare.com/workers", weight: 22 },
	{ url: "https://discord.com/invite/supersaas", weight: 18 },
	{ url: "https://x.com/supersaas", weight: 15 },
	{ url: "https://status.supersaas.example", weight: 10 },
];

const PAGE_COUNTS = [1, 1, 1, 2, 2, 3, 4, 5];
const RAW_PAST_DAYS = 3;
// identify() ids the demo Site reports; each shows up on most raw days, so Identified visitors have journeys across days.
const DEMO_IDENTITIES = ["customer-1001", "customer-1002", "customer-1003", "customer-1004", "customer-1005"];
const IDENTIFIED_PER_DAY_CHANCE = 0.75;
const RETURNING_VISITOR_CHANCE = 0.32;
const OUTBOUND_CLICK_CHANCE = 0.18;

function weightedPick<T extends Weighted>(items: T[]): T {
	let remaining = Math.random() * items.reduce((sum, item) => sum + item.weight, 0);
	for (const item of items) {
		if (remaining < item.weight) {
			return item;
		}
		remaining -= item.weight;
	}
	return items[items.length - 1]!;
}

function pick<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)]!;
}

function randomInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function newVisitorId() {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function increment(map: Map<string, number>, key: string, by = 1) {
	map.set(key, (map.get(key) ?? 0) + by);
}

function visitPaths() {
	return Array.from({ length: pick(PAGE_COUNTS) }, () => weightedPick(PAGES));
}

export interface DemoEvent {
	name: string;
	props: Record<string, string> | null;
}

function eventsOn(path: string): DemoEvent[] {
	return EVENT_RULES
		.filter(rule => rule.pages.includes(path) && Math.random() < rule.chance)
		.map(rule => ({ name: rule.name, props: rule.props?.() ?? null }));
}

export interface DemoRollupPage {
	path: string;
	title: string;
	pageviews: number;
	visitors: number;
	visits: number;
	entrances: number;
	exits: number;
	bounces: number;
	timeOnPageSeconds: number;
	timedPageviews: number;
}

interface PageStat {
	title: string;
	views: number;
	visitors: Set<string>;
	visits: number;
	entrances: number;
	exits: number;
	bounces: number;
	timeOnPageSeconds: number;
	timedPageviews: number;
}

export interface DemoRollupDay {
	date: string;
	summary: { visitors: number; visits: number; pageviews: number; bounceRate: number; avgDurationSeconds: number };
	pages: DemoRollupPage[];
	sources: { source: DemoSource; visits: number }[];
	devices: { device: DemoDevice; visits: number }[];
	locations: { location: DemoLocation; visits: number }[];
	outboundLinks: { url: string; clicks: number }[];
	events: { name: string; path: string; count: number }[];
}

export interface DemoVisit {
	id: string;
	visitorId: string;
	startedAt: number;
	endedAt: number;
	source: DemoSource;
	device: DemoDevice;
	location: DemoLocation;
	pages: { path: string; title: string; timestamp: number; events: DemoEvent[] }[];
	outboundLink: string | null;
}

export interface DemoVisitor {
	id: string;
	firstSeen: number;
	lastSeen: number;
	location: DemoLocation;
	identity: string | null;
}

export interface DemoTraffic {
	rollupDays: DemoRollupDay[];
	rawVisits: DemoVisit[];
	rawVisitors: DemoVisitor[];
	todayVisitCount: number;
	// The last few past days are written as raw rows and then rolled up, so "Last 24 hours", the hourly yesterday chart, today's comparison and journeys across days have data.
	rawPastDates: string[];
}

function visitorIdPicker() {
	const knownVisitorIds: string[] = [];
	return () => {
		if (knownVisitorIds.length > 0 && Math.random() < RETURNING_VISITOR_CHANCE) {
			return pick(knownVisitorIds);
		}
		const id = newVisitorId();
		knownVisitorIds.push(id);
		return id;
	};
}

// Older days become Rollups only, since no unfiltered Range reads their raw rows; the last few days and today become raw rows.
export function generateDemoTraffic(today: string, timezone: string, days: number, now = new Date()): DemoTraffic {
	const rawPastDayCount = Math.min(RAW_PAST_DAYS, days - 1);
	const rollupVisitorId = visitorIdPicker();
	const rollupDays: DemoRollupDay[] = [];
	for (let offset = days - 1; offset > rawPastDayCount; offset--) {
		rollupDays.push(generateRollupDay(shiftDate(today, -offset), offset, days, rollupVisitorId));
	}

	const dayStartSec = (date: string) => Math.floor(startOfDayUtcMs(date, timezone) / 1000);
	const nowSec = Math.floor(now.getTime() / 1000);
	const todayStartSec = dayStartSec(today);
	const elapsedFraction = Math.min(1, Math.max(0, (nowSec - todayStartSec) / 86_400));

	// Visitor ids rotate daily (ADR 0002), so each raw day draws from its own pool.
	const rawDay = (visitCount: number, fromSec: number, toSec: number) => {
		const pickVisitorId = visitorIdPicker();
		return Array.from({ length: visitCount }, () => generateRawVisit(pickVisitorId(), fromSec, toSec));
	};
	const rawPastDates = Array.from({ length: rawPastDayCount }, (_, index) => shiftDate(today, index - rawPastDayCount));
	const pastDays = rawPastDates.map(date => rawDay(Math.max(3, Math.round(42 * (0.7 + Math.random() * 0.6))), dayStartSec(date), dayStartSec(shiftDate(date, 1)) - 1));
	const todayVisits = rawDay(Math.max(2, Math.round(45 * elapsedFraction * (0.7 + Math.random() * 0.6))), todayStartSec, nowSec);

	const rawDays = [...pastDays, todayVisits];
	return {
		rollupDays,
		rawVisits: rawDays.flat(),
		rawVisitors: rawDays.flatMap(dayVisits => identifySome(visitorsOf(dayVisits))),
		todayVisitCount: todayVisits.length,
		rawPastDates,
	};
}

function identifySome(dayVisitors: DemoVisitor[]): DemoVisitor[] {
	const anonymous = [...dayVisitors];
	for (const identity of DEMO_IDENTITIES) {
		if (anonymous.length > 0 && Math.random() < IDENTIFIED_PER_DAY_CHANCE) {
			anonymous.splice(Math.floor(Math.random() * anonymous.length), 1)[0]!.identity = identity;
		}
	}
	return dayVisitors;
}

function generateRollupDay(date: string, offset: number, days: number, pickVisitorId: () => string): DemoRollupDay {
	const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
	const weekdayMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
	const growth = 1 - (offset / Math.max(days - 1, 1)) * 0.55;
	const jitter = 0.7 + Math.random() * 0.6;
	const visitCount = Math.max(3, Math.round(40 * growth * weekdayMultiplier * jitter));

	let pageviews = 0;
	let bounces = 0;
	let durationSum = 0;
	const visitors = new Set<string>();
	const pageStats = new Map<string, PageStat>();
	const sources = new Map<DemoSource, number>();
	const devices = new Map<DemoDevice, number>();
	const locations = new Map<DemoLocation, number>();
	const outboundLinks = new Map<string, number>();
	const events = new Map<string, number>();

	for (let index = 0; index < visitCount; index++) {
		const visitorId = pickVisitorId();
		visitors.add(visitorId);
		const paths = visitPaths();
		const isBounce = paths.length === 1;
		const secondsPerPage = randomInt(20, 180);
		durationSum += isBounce ? randomInt(4, 45) : secondsPerPage * paths.length;
		pageviews += paths.length;
		bounces += isBounce ? 1 : 0;

		paths.forEach((page, position) => {
			const stat = pageStats.get(page.path) ?? { title: page.title, views: 0, visitors: new Set(), visits: 0, entrances: 0, exits: 0, bounces: 0, timeOnPageSeconds: 0, timedPageviews: 0 };
			stat.views++;
			stat.visitors.add(visitorId);
			if (position < paths.length - 1) {
				stat.timeOnPageSeconds += secondsPerPage;
				stat.timedPageviews++;
			}
			pageStats.set(page.path, stat);
			eventsOn(page.path).forEach(event => increment(events, JSON.stringify([event.name, page.path])));
		});
		new Set(paths.map(page => page.path)).forEach(path => pageStats.get(path)!.visits++);
		pageStats.get(paths[0]!.path)!.entrances++;
		pageStats.get(paths[0]!.path)!.bounces += isBounce ? 1 : 0;
		pageStats.get(paths.at(-1)!.path)!.exits++;

		if (Math.random() < OUTBOUND_CLICK_CHANCE) {
			increment(outboundLinks, weightedPick(OUTBOUND_LINKS).url);
		}
		const source = weightedPick(REFERRERS);
		const device = weightedPick(DEVICES);
		const location = weightedPick(LOCATIONS);
		sources.set(source, (sources.get(source) ?? 0) + 1);
		devices.set(device, (devices.get(device) ?? 0) + 1);
		locations.set(location, (locations.get(location) ?? 0) + 1);
	}

	return {
		date,
		summary: {
			visitors: visitors.size,
			visits: visitCount,
			pageviews,
			bounceRate: bounces / visitCount,
			avgDurationSeconds: durationSum / visitCount,
		},
		pages: Array.from(pageStats, ([path, { views, visitors, ...stat }]) => ({ path, ...stat, pageviews: views, visitors: visitors.size })),
		sources: Array.from(sources, ([source, visits]) => ({ source, visits })),
		devices: Array.from(devices, ([device, visits]) => ({ device, visits })),
		locations: Array.from(locations, ([location, visits]) => ({ location, visits })),
		outboundLinks: Array.from(outboundLinks, ([url, clicks]) => ({ url, clicks })),
		events: Array.from(events, ([key, count]) => {
			const [name, path] = JSON.parse(key) as [string, string];
			return { name, path, count };
		}),
	};
}

function generateRawVisit(visitorId: string, fromSec: number, toSec: number): DemoVisit {
	const paths = visitPaths();
	const isBounce = paths.length === 1;
	const startedAt = randomInt(fromSec, toSec);
	const gap = randomInt(15, 90);
	const endedAt = isBounce ? startedAt + randomInt(4, 45) : startedAt + gap * (paths.length - 1);

	return {
		id: crypto.randomUUID(),
		visitorId,
		startedAt,
		endedAt,
		source: weightedPick(REFERRERS),
		device: weightedPick(DEVICES),
		location: weightedPick(LOCATIONS),
		pages: paths.map((page, index) => ({
			path: page.path,
			title: page.title,
			timestamp: isBounce ? startedAt : startedAt + index * gap,
			events: eventsOn(page.path),
		})),
		outboundLink: Math.random() < OUTBOUND_CLICK_CHANCE ? weightedPick(OUTBOUND_LINKS).url : null,
	};
}

function visitorsOf(visits: DemoVisit[]): DemoVisitor[] {
	const visitors = new Map<string, DemoVisitor>();
	for (const visit of visits) {
		const existing = visitors.get(visit.visitorId);
		if (!existing) {
			visitors.set(visit.visitorId, { id: visit.visitorId, firstSeen: visit.startedAt, lastSeen: visit.endedAt, location: visit.location, identity: null });
			continue;
		}
		existing.firstSeen = Math.min(existing.firstSeen, visit.startedAt);
		if (visit.endedAt > existing.lastSeen) {
			existing.lastSeen = visit.endedAt;
			existing.location = visit.location;
		}
	}
	return Array.from(visitors.values());
}

export interface DemoPayment {
	visitorId: string;
	amount: number;
	paidAt: number;
}

const DEMO_PAYMENT_AMOUNTS = [900, 1900, 4900, 7900];
const PAYMENT_AFTER_PRICING_CHANCE = 0.3;

// Some Visitors who saw the pricing page pay a few minutes after their last Visit; at least one always does.
export function generateDemoPayments(traffic: DemoTraffic, nowSec = Math.floor(Date.now() / 1000)): DemoPayment[] {
	const lastVisitEnd = new Map<string, number>();
	const sawPricing = new Set<string>();
	for (const visit of traffic.rawVisits) {
		lastVisitEnd.set(visit.visitorId, Math.max(lastVisitEnd.get(visit.visitorId) ?? 0, visit.endedAt));
		if (visit.pages.some(page => page.path === "/pricing")) {
			sawPricing.add(visit.visitorId);
		}
	}
	const payers = [...sawPricing].filter(() => Math.random() < PAYMENT_AFTER_PRICING_CHANCE);
	const firstVisitor = traffic.rawVisits[0]?.visitorId;
	if (payers.length === 0 && firstVisitor) {
		payers.push(firstVisitor);
	}
	return payers.map(visitorId => ({
		visitorId,
		amount: pick(DEMO_PAYMENT_AMOUNTS),
		paidAt: Math.min(nowSec, lastVisitEnd.get(visitorId)! + randomInt(5, 300)),
	}));
}

interface DemoKeyword {
	query: string;
	path: string;
	impressions: number;
	position: number;
	// Change in daily impressions over the seeded days, so some keywords win and some lose.
	trend: number;
	// Only searched in the newest or the oldest part of the seeded days, for the New and Lost buckets.
	only?: "recent" | "early";
}

const DEMO_KEYWORDS: DemoKeyword[] = [
	{ query: "supersaas", path: "/", impressions: 120, position: 1.2, trend: 0.3 },
	{ query: "saas boilerplate", path: "/", impressions: 260, position: 4.5, trend: 0.8 },
	{ query: "nuxt saas starter", path: "/docs/getting-started", impressions: 140, position: 3.1, trend: 0.5 },
	{ query: "saas starter kit pricing", path: "/pricing", impressions: 60, position: 2.4, trend: -0.4 },
	{ query: "how to build a saas", path: "/blog/how-we-built-supersaas", impressions: 320, position: 13.5, trend: 0.2 },
	{ query: "vue saas template", path: "/", impressions: 180, position: 7.8, trend: -0.5 },
	{ query: "cookieless analytics nuxt", path: "/docs", impressions: 90, position: 15.2, trend: 0.1 },
	{ query: "saas changelog example", path: "/changelog", impressions: 40, position: 9.1, trend: 0 },
	{ query: "supersaas vs shipfast", path: "/blog", impressions: 50, position: 5.5, trend: 1, only: "recent" },
	{ query: "supersaas coupon", path: "/pricing", impressions: 30, position: 6.2, trend: 0, only: "early" },
];

const SEARCH_COUNTRIES = [{ value: "US", weight: 40 }, { value: "GB", weight: 14 }, { value: "IN", weight: 14 }, { value: "DE", weight: 10 }, { value: "CA", weight: 8 }, { value: "FR", weight: 7 }, { value: "AU", weight: 7 }];
const SEARCH_DEVICES = [{ value: "desktop", weight: 62 }, { value: "mobile", weight: 34 }, { value: "tablet", weight: 4 }];

export interface DemoSearch {
	days: { date: string; clicks: number; impressions: number; positionSum: number; positionedImpressions: number }[];
	rows: { date: string; query: string; page: string; path: string; country: string; device: string; clicks: number; impressions: number; positionSum: number }[];
}

// Search Console's shape: daily totals, and rows per keyword, page, country and device, ending two days ago like Google.
export function generateDemoSearch(domain: string, today: string, days: number): DemoSearch {
	const search: DemoSearch = { days: [], rows: [] };
	for (let offset = days + 1; offset >= 2; offset -= 1) {
		const date = shiftDate(today, -offset);
		const progress = 1 - (offset - 2) / days;
		let dayClicks = 0;
		let dayImpressions = 0;
		let dayPositionSum = 0;
		for (const keyword of DEMO_KEYWORDS) {
			if ((keyword.only === "recent" && progress < 0.85) || (keyword.only === "early" && progress > 0.6)) {
				continue;
			}
			const impressions = Math.max(1, Math.round(keyword.impressions * (1 + keyword.trend * (progress - 0.5)) * (0.7 + Math.random() * 0.6)));
			const position = Math.max(1, keyword.position + (Math.random() - 0.5));
			const clicks = Math.round(impressions * expectedCtr(position) * (0.4 + Math.random()));
			const country = weightedPick(SEARCH_COUNTRIES).value;
			const device = weightedPick(SEARCH_DEVICES).value;
			search.rows.push({ date, query: keyword.query, page: `https://${domain}${keyword.path}`, path: keyword.path, country, device, clicks, impressions, positionSum: position * impressions });
			dayClicks += clicks;
			dayImpressions += impressions;
			dayPositionSum += position * impressions;
		}
		// Anonymized queries count in the daily totals only.
		const anonymized = randomInt(10, 40);
		search.days.push({ date, clicks: dayClicks + randomInt(0, 3), impressions: dayImpressions + anonymized, positionSum: dayPositionSum + anonymized * 20, positionedImpressions: dayImpressions + anonymized });
	}
	return search;
}

const BING_SHARE = 0.15;

// Bing's shape from the Google demo: a smaller share, with keyword rows and page rows apart and no country or device.
export function demoBingSearch(google: DemoSearch): DemoSearch {
	const share = (value: number) => Math.round(value * BING_SHARE);
	const rows = google.rows.flatMap(row => [
		{ ...row, page: "", path: "", country: "", device: "", clicks: share(row.clicks), impressions: share(row.impressions), positionSum: row.positionSum * BING_SHARE },
		{ ...row, query: "", country: "", device: "", clicks: share(row.clicks), impressions: share(row.impressions), positionSum: row.positionSum * BING_SHARE },
	]).filter(row => row.impressions > 0);
	const days = google.days.map(day => ({ ...day, clicks: share(day.clicks), impressions: share(day.impressions), positionSum: day.positionSum * BING_SHARE, positionedImpressions: share(day.positionedImpressions) }));
	return { days, rows };
}
