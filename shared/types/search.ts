import type { Site } from "./analytics";
import type { KeywordBucket, KeywordTotals, SearchEngine, SearchRangeKey, SearchTotals, SearchWindow } from "../utils/search";

// The credential never leaves the server. `syncedThrough` and `backfilledFrom` are the newest and oldest days fetched.
export interface SearchConnection {
	engine: SearchEngine;
	property: string | null;
	syncedAt: number | null;
	syncedThrough: string | null;
	backfilledFrom: string | null;
	lastError: string | null;
	createdAt: number;
}

// `googleAvailable` is false while no Google OAuth client is configured, as on a fresh Self-hosted copy.
export interface SearchConnections {
	google: SearchConnection | null;
	bing: SearchConnection | null;
	googleAvailable: boolean;
}

export interface SearchProperty {
	id: string;
	label: string;
}

export interface SearchPoint {
	date: string;
	engine: SearchEngine;
	clicks: number;
	impressions: number;
}

export interface SearchBreakdownRow extends SearchTotals {
	value: string;
}

export interface SearchBreakdowns {
	pages: SearchBreakdownRow[];
	countries: SearchBreakdownRow[];
	devices: SearchBreakdownRow[];
}

// `window` is null until the first day of data arrives. `engines` lists the engines with a property picked, and
// `points` holds a point per day and engine in the window.
export interface SearchReport extends SearchBreakdowns {
	range: SearchRangeKey;
	engines: SearchEngine[];
	window: SearchWindow | null;
	summary: SearchTotals & { previous: SearchTotals };
	points: SearchPoint[];
	buckets: Record<KeywordBucket, KeywordTotals[]>;
	// The hundred keywords with the most clicks, of `keywordTotal` matching the search.
	keywords: KeywordTotals[];
	keywordTotal: number;
}

// One card per Site on the Search insights page. `engines` are those with a property picked; `window` and `summary`
// stay null until the first day of data arrives, and `trend` holds the daily clicks over the window.
export interface SiteSearchInsight {
	site: Site;
	engines: SearchEngine[];
	lastSyncedAt: number | null;
	window: SearchWindow | null;
	summary: (SearchTotals & { previous: SearchTotals }) | null;
	trend: number[];
}

export interface SearchInsights {
	range: SearchRangeKey;
	sites: SiteSearchInsight[];
}
