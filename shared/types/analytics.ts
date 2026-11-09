import type { ResolvedRange } from "../utils/dates";
import type { FunnelDefinition, FunnelReport } from "../utils/funnels";
import type { GoalDefinition } from "../utils/goals";
import type { JourneyGroup, JourneyNode } from "../utils/journeys";
import type { SearchTotals } from "../utils/search";

export interface Site {
	id: string;
	organizationId: string;
	name: string;
	domain: string;
	timezone: string;
	excludedIps: string[];
	excludedPaths: string[];
	createdAt: number;
}

export interface Summary {
	visitors: number;
	visits: number;
	pageviews: number;
	bounceRate: number;
	avgDurationSeconds: number;
}

// `conversionRate` is null while the Site has no Goals, and `revenue` while it has no Revenue connection.
export interface DashboardSummary extends Summary {
	conversionRate: number | null;
	revenue: number | null;
}

// Revenue is in the minor unit of `currency`, the Revenue connection's.
export interface SummaryWithPrevious extends DashboardSummary {
	currency: string | null;
	previous: DashboardSummary;
}

export interface TimeseriesPoint {
	timestamp: number;
	visitors: number;
	pageviews: number;
	bounceRate: number;
	avgDurationSeconds: number;
	conversionRate?: number;
	revenue?: number;
}

export interface Goal extends GoalDefinition {
	id: string;
	name: string;
	createdAt: number;
}

// `visitors` are the unique Visitors who converted, and `conversions` every completion, such as two clicks in one Visit.
export interface GoalConversion {
	goal: Goal;
	conversions: number;
	visitors: number;
	conversionRate: number;
}

export interface GoalReport {
	visitors: number;
	converted: number;
	conversionRate: number;
	goals: GoalConversion[];
}

export interface Funnel extends FunnelDefinition {
	id: string;
	createdAt: number;
	updatedAt: number;
}

export interface FunnelResults extends FunnelReport {
	range: ResolvedRange;
}

// `step` 1 is "1 step after" the starting point. `exits` counts the Visitors who left after the previous selected node.
export interface JourneyStepColumn {
	step: number;
	visitors: number;
	nodes: JourneyNode[];
	exits: number;
}

export interface JourneyEvent {
	name: string;
	count: number;
	visitors: number;
}

export interface Journeys {
	range: ResolvedRange;
	visitors: number;
	path: string[];
	startingPoints: JourneyGroup[];
	steps: JourneyStepColumn[];
	events: { path: string; rows: JourneyEvent[] } | null;
}

export const PAGE_DIMENSIONS = ["top", "entered", "exited", "outbound"] as const;
export const SOURCE_DIMENSIONS = ["channel", "referrer", "ai", "campaign", "medium", "term", "content"] as const;
export const DEVICE_DIMENSIONS = ["browser", "os", "device"] as const;
export const LOCATION_DIMENSIONS = ["country", "region", "city"] as const;

export type PageDimension = typeof PAGE_DIMENSIONS[number];
export type SourceDimension = typeof SOURCE_DIMENSIONS[number];
export type DeviceDimension = typeof DEVICE_DIMENSIONS[number];
export type LocationDimension = typeof LOCATION_DIMENSIONS[number];

export interface TopListResult<TRow> {
	rows: TRow[];
	total: number;
}

export interface TopPageRow {
	path: string;
	count: number;
}

export interface TopSourceRow {
	key: string;
	label: string;
	referrerDomain?: string;
	visits: number;
}

export interface TopDeviceRow {
	value: string;
	visits: number;
}

export interface TopLocationRow {
	country: string;
	region: string;
	city: string;
	visits: number;
}

// `path` is null for an Event sent without the page it fired on.
export interface TopEventRow {
	name: string;
	path: string | null;
	count: number;
}

export interface EventPropertyValue {
	value: string;
	count: number;
}

export interface EventProperty {
	key: string;
	count: number;
	values: EventPropertyValue[];
}

// `path` is null when the breakdown covers every page, and "" for Events sent without one.
export interface EventProperties {
	name: string;
	path: string | null;
	count: number;
	properties: EventProperty[];
}

export const PAGE_STATS_SORTS = ["page", "views", "visits", "bounce", "duration"] as const;

export type PageStatsSort = typeof PAGE_STATS_SORTS[number];

export type SortOrder = "asc" | "desc";

// `bounceRate` is null for a page no Visit entered on, and `avgTimeOnPageSeconds` for a page only ever viewed last in its Visit.
// `revenue` is null while the Site has no Revenue connection.
export interface PageStatsRow {
	path: string;
	title: string | null;
	pageviews: number;
	visits: number;
	previousVisits: number;
	bounceRate: number | null;
	avgTimeOnPageSeconds: number | null;
	revenue: number | null;
	// From search engines' page rows, over the Range's days and unaffected by Filters. Null without a Search connection.
	search: SearchTotals | null;
	trend: number[];
}

export interface PageStatsSummary {
	pages: number;
	pageviews: number;
	visits: number;
	bounceRate: number;
	avgTimeOnPageSeconds: number;
	searchClicks: number | null;
}

// `total` counts every page matching the search, while `rows` holds the first hundred in the chosen order. `currency` is
// the Revenue connection's, and null without one.
export interface PageStats {
	currency: string | null;
	summary: PageStatsSummary;
	rows: PageStatsRow[];
	total: number;
}

// Unique clicks count each Visitor once per link, so they add up across links.
export interface OutboundLinkSummary {
	clicks: number;
	uniqueClicks: number;
	links: number;
	avgClicksPerLink: number;
}

export interface OutboundLinkRow {
	url: string;
	clicks: number;
	visitors: number;
	previousVisitors: number;
	trend: number[];
}

// `total` counts every link, while `rows` holds the hundred with the most clicks.
export interface OutboundLinkStats {
	summary: OutboundLinkSummary;
	rows: OutboundLinkRow[];
	total: number;
}

export interface OutboundLinkBreakdownRow {
	value: string;
	clicks: number;
}

// `pages` are where the clicks came from: the latest Pageview of the click's Visit at the time of the click.
export interface OutboundLinkDetail {
	url: string;
	clicks: number;
	uniqueClicks: number;
	clicksPerDay: number;
	topCountry: string | null;
	countries: OutboundLinkBreakdownRow[];
	pages: OutboundLinkBreakdownRow[];
	devices: OutboundLinkBreakdownRow[];
	trend: number[];
}

export interface LiveVisitorLocation {
	latitude: number;
	longitude: number;
	count: number;
}

export interface LiveVisitors {
	count: number;
	locations: LiveVisitorLocation[];
}

export interface RealtimePageviews {
	total: number;
	peak: number;
	points: { timestamp: number; pageviews: number }[];
}

export interface RealtimeChip {
	value: string;
	count: number;
}

export interface RealtimeVisitor {
	id: string;
	label: string;
	site: Pick<Site, "id" | "name" | "domain">;
	path: string | null;
	lastSeen: number;
	location: VisitorPlace | null;
	device: VisitorDevice | null;
	source: VisitorSource | null;
	coordinates: { latitude: number; longitude: number } | null;
}

// Pageviews cover the last 30 minutes in one-minute points; chips and the list describe each Live visitor's latest Visit.
export interface Realtime extends LiveVisitors {
	pageviews: RealtimePageviews;
	referrers: RealtimeChip[];
	countries: RealtimeChip[];
	devices: RealtimeChip[];
	visitors: RealtimeVisitor[];
}

export type WithRange<T> = T & { range: ResolvedRange };

export interface TrafficTotals {
	visitors: number;
	pageviews: number;
}

export interface TrafficPoint extends TrafficTotals {
	timestamp: number;
}

export interface Money {
	currency: string;
	amount: number;
}

// `revenue` and `currency` are null while the Site has no Revenue connection.
// `searchClicks` covers the 28 days up to the Site's latest search data, and is null without any.
export interface SiteOverview extends TrafficTotals {
	site: Site;
	previous: TrafficTotals & { revenue: number; searchClicks: number };
	searchClicks: number | null;
	revenue: number | null;
	currency: string | null;
	live: number;
	trend: TrafficPoint[];
}

// Every figure covers the last 24 hours and compares with the 24 hours before. Revenue is totalled per currency.
export interface AllSitesOverview {
	totals: TrafficTotals & { previous: TrafficTotals; live: number; revenue: Money[]; searchClicks: number | null };
	sites: SiteOverview[];
}

export interface VisitorSource {
	channel: string;
	referrerDomain: string;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
}

export interface VisitorDevice {
	browser: string;
	os: string;
	deviceType: string;
}

export interface VisitorPlace {
	country: string;
	region: string | null;
	city: string | null;
}

// `source` and `entryPage` come from the Visitor's first Visit in the Range, `device`, `location` and `exitPage` from its last.
export interface VisitorRow {
	id: string;
	label: string;
	identified: boolean;
	location: VisitorPlace | null;
	source: VisitorSource | null;
	device: VisitorDevice | null;
	visits: number;
	pageviews: number;
	durationSeconds: number;
	entryPage: string | null;
	exitPage: string | null;
	firstSeen: number;
	lastSeen: number;
}

export interface VisitorsSummary {
	visitors: number;
	pageviews: number;
	viewsPerVisitor: number;
	avgTimeSeconds: number;
}

// `total` counts every Visitor matching the search, while `rows` holds the hundred seen most recently.
export interface VisitorList {
	summary: VisitorsSummary;
	rows: VisitorRow[];
	total: number;
}

export interface JourneyVisit {
	id: string;
	startedAt: number;
	endedAt: number;
	pageviews: number;
	entryPage: string | null;
	exitPage: string | null;
	source: VisitorSource | null;
}

// `timeOnPageSeconds` is null for a Visit's last Pageview. Outbound links carry the Visit they fell in, judged by time.
export type JourneyStep
	= | { type: "pageview"; visitId: string; timestamp: number; path: string; title: string | null; entry: boolean; timeOnPageSeconds: number | null }
		| { type: "outbound"; visitId: string | null; timestamp: number; url: string }
		| { type: "event"; visitId: string; timestamp: number; name: string; path: string | null; props: Record<string, unknown> | null };

export interface VisitorJourney {
	visitorId: string;
	label: string;
	firstSeen: number;
	lastSeen: number;
	location: VisitorPlace | null;
	device: VisitorDevice | null;
	visits: JourneyVisit[];
	steps: JourneyStep[];
}

export interface VisitorProfileTotals {
	days: number;
	visits: number;
	pageviews: number;
	events: number;
	outboundLinks: number;
	durationSeconds: number;
}

// An Identified visitor's profile holds a journey for every day sharing its identify hash, newest first.
export interface VisitorProfile {
	id: string;
	label: string;
	identified: boolean;
	totals: VisitorProfileTotals;
	firstVisit: { startedAt: number; source: VisitorSource | null } | null;
	journeys: VisitorJourney[];
}

export interface ShareLink {
	id: string;
	name: string;
	token: string;
	hasPassword: boolean;
	// Set when the link shares one Outbound link's stats instead of the dashboard.
	outboundUrl: string | null;
	createdAt: number;
}

export type SharedSite = Pick<Site, "id" | "name" | "domain" | "timezone">;

// A locked link reveals nothing about its Site until the password is given.
export type SharedDashboard = { locked: true } | { locked: false; site: SharedSite; outboundUrl: string | null };
