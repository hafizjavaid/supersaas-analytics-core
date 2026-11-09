import { shiftDate } from "./dates";

export const SEARCH_ENGINES = ["google", "bing"] as const;
export type SearchEngine = typeof SEARCH_ENGINES[number];

export const SEARCH_ENGINE_NAMES: Record<SearchEngine, string> = {
	google: "Google",
	bing: "Bing",
};

export function isSearchEngine(value: unknown): value is SearchEngine {
	return SEARCH_ENGINES.includes(value as SearchEngine);
}

export const SEARCH_RANGES = ["7d", "28d", "90d", "12m"] as const;
export type SearchRangeKey = typeof SEARCH_RANGES[number];

export const SEARCH_RANGE_LABELS: Record<SearchRangeKey, string> = {
	"7d": "7 days",
	"28d": "28 days",
	"90d": "90 days",
	"12m": "12 months",
};

export const SEARCH_RANGE_DAYS: Record<SearchRangeKey, number> = {
	"7d": 7,
	"28d": 28,
	"90d": 90,
	"12m": 365,
};

export function isSearchRange(value: unknown): value is SearchRangeKey {
	return SEARCH_RANGES.includes(value as SearchRangeKey);
}

export interface SearchWindow {
	from: string;
	to: string;
	previousFrom: string;
	previousTo: string;
}

// Search engines report days late, so a window ends at the latest day with data rather than today.
export function searchWindow(range: SearchRangeKey, latestDate: string): SearchWindow {
	const days = SEARCH_RANGE_DAYS[range];
	const from = shiftDate(latestDate, -(days - 1));
	return { from, to: latestDate, previousFrom: shiftDate(from, -days), previousTo: shiftDate(from, -1) };
}

// Search Console keeps 16 months.
export const BACKFILL_DAYS = 486;
const CHUNK_DAYS = 30;
const REFETCH_DAYS = 3;
const REFRESH_INTERVAL_SEC = 12 * 3600;

export interface SyncCursor {
	syncedThrough: string | null;
	backfilledFrom: string | null;
	syncedAt: number | null;
}

export interface SyncChunk {
	from: string;
	to: string;
}

function later(a: string, b: string) {
	return a > b ? a : b;
}

function earlier(a: string, b: string) {
	return a < b ? a : b;
}

export function searchRefreshDue(cursor: SyncCursor, nowSec: number) {
	return cursor.syncedThrough === null || cursor.syncedAt === null || nowSec - cursor.syncedAt >= REFRESH_INTERVAL_SEC;
}

// Recent days first, oldest chunk first so an interrupted run resumes without a gap; then the backfill, newest first,
// so the Search page fills from today backwards.
export function planSearchSync(cursor: SyncCursor, today: string, nowSec: number): SyncChunk[] {
	const latest = shiftDate(today, -1);
	const earliest = shiftDate(today, -BACKFILL_DAYS);
	const chunks: SyncChunk[] = [];

	const refreshFrom = cursor.syncedThrough === null
		? shiftDate(latest, -(CHUNK_DAYS - 1))
		: later(earliest, shiftDate(cursor.syncedThrough, -REFETCH_DAYS));
	if (searchRefreshDue(cursor, nowSec)) {
		for (let from = refreshFrom; from <= latest; from = shiftDate(from, CHUNK_DAYS)) {
			chunks.push({ from, to: earlier(latest, shiftDate(from, CHUNK_DAYS - 1)) });
		}
	}

	const backfillStart = cursor.backfilledFrom ?? refreshFrom;
	for (let to = shiftDate(backfillStart, -1); to >= earliest; to = shiftDate(to, -CHUNK_DAYS)) {
		chunks.push({ from: later(earliest, shiftDate(to, -(CHUNK_DAYS - 1))), to });
	}
	return chunks;
}

export interface SearchTotals {
	clicks: number;
	impressions: number;
	// Impression-weighted, and null without impressions.
	position: number | null;
}

export interface KeywordTotals extends SearchTotals {
	query: string;
	previous: SearchTotals;
}

export const KEYWORD_BUCKETS = ["winners", "losers", "opportunities", "quickWins", "new", "lost"] as const;
export type KeywordBucket = typeof KEYWORD_BUCKETS[number];

export const KEYWORD_BUCKET_LABELS: Record<KeywordBucket, { label: string; description: string }> = {
	winners: { label: "Winners", description: "More clicks than the period before" },
	losers: { label: "Losers", description: "Fewer clicks than the period before" },
	opportunities: { label: "Opportunities", description: "Seen often on page 2, positions 11 to 20" },
	quickWins: { label: "Quick wins", description: "Ranking on page 1 but under-clicked" },
	new: { label: "New", description: "Seen now and not the period before" },
	lost: { label: "Lost", description: "Seen the period before and not now" },
};

const BUCKET_LIMIT = 10;
const MIN_IMPRESSIONS = 10;

// Typical organic CTR by position on page 1; a Quick win earns less than half of it.
const EXPECTED_CTR = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.03, 0.025];

export function expectedCtr(position: number): number {
	const rank = Math.min(Math.max(Math.round(position), 1), EXPECTED_CTR.length);
	return EXPECTED_CTR[rank - 1]!;
}

function missedClicks(row: KeywordTotals) {
	return expectedCtr(row.position ?? 10) * row.impressions - row.clicks;
}

function top(rows: KeywordTotals[], keep: (row: KeywordTotals) => boolean, score: (row: KeywordTotals) => number) {
	return rows.filter(keep).sort((a, b) => score(b) - score(a) || a.query.localeCompare(b.query)).slice(0, BUCKET_LIMIT);
}

export function bucketKeywords(rows: KeywordTotals[]): Record<KeywordBucket, KeywordTotals[]> {
	const inBoth = (row: KeywordTotals) => row.impressions > 0 && row.previous.impressions > 0;
	const seenEnough = (row: KeywordTotals) => row.impressions >= MIN_IMPRESSIONS && row.position !== null;
	return {
		winners: top(rows, row => inBoth(row) && row.clicks > row.previous.clicks, row => row.clicks - row.previous.clicks),
		losers: top(rows, row => inBoth(row) && row.clicks < row.previous.clicks, row => row.previous.clicks - row.clicks),
		opportunities: top(rows, row => seenEnough(row) && row.position! > 10 && row.position! <= 20, row => row.impressions),
		quickWins: top(rows, row => seenEnough(row) && row.position! <= 10 && row.clicks / row.impressions < expectedCtr(row.position!) / 2, missedClicks),
		new: top(rows, row => row.impressions > 0 && row.previous.impressions === 0, row => row.clicks * 1e6 + row.impressions),
		lost: top(rows, row => row.impressions === 0 && row.previous.impressions > 0, row => row.previous.clicks * 1e6 + row.previous.impressions),
	};
}

export function clickThroughRate({ clicks, impressions }: { clicks: number; impressions: number }) {
	return impressions > 0 ? clicks / impressions : 0;
}

// Search engines report full URLs; the Pages tab keys pages by path.
export function searchPath(url: string): string {
	try {
		return new URL(url).pathname || "/";
	}
	catch {
		return url;
	}
}
