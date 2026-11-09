import { shiftDate } from "#layers/core/shared/utils/dates";

// The test server reads Google Search Console (and Bing Webmaster Tools) from this stand-in, started in global-setup.ts.
export const FAKE_SEARCH_PORT = 3103;
export const FAKE_SEARCH_URL = `http://127.0.0.1:${FAKE_SEARCH_PORT}`;
export const FAKE_GOOGLE_OAUTH_URL = `${FAKE_SEARCH_URL}/o/oauth2/v2/auth`;
export const TEST_GOOGLE_CLIENT_ID = "test-google-client";

// Codes the stand-in exchanges: for a working refresh token, for one Google later reports revoked, or none at all.
export const GOOGLE_CODE = "google-code";
export const GOOGLE_REVOKED_CODE = "google-revoked-code";
export const GOOGLE_REFRESH_TOKEN = "1//google-refresh-token";
export const GOOGLE_REVOKED_REFRESH_TOKEN = "1//google-revoked-token";

// The first has a year and a half of data, the second none, and the third is unverified.
export const GOOGLE_PROPERTY = "sc-domain:example.com";
export const GOOGLE_EMPTY_PROPERTY = "https://www.other.example/";
export const GOOGLE_UNVERIFIED_PROPERTY = "https://unverified.example/";

// Google reports with a lag, so the stand-in's newest day is two days ago (UTC), and it keeps 16 months.
export function fakeGoogleLatest(today = utcToday()) {
	return shiftDate(today, -2);
}

export function utcToday() {
	return new Date().toISOString().slice(0, 10);
}

export interface FakeGoogleRow {
	keys: [query: string, page: string, country: string, device: string];
	clicks: number;
	impressions: number;
	position: number;
}

// "fresh keyword" appears in the 7 days ending at the newest day, and "old keyword" only in the 7 before them.
export function fakeGoogleRows(date: string, today = utcToday()): FakeGoogleRow[] {
	const rows: FakeGoogleRow[] = [
		{ keys: ["analytics tool", "https://example.com/", "usa", "DESKTOP"], clicks: 3, impressions: 40, position: 2 },
		{ keys: ["analytics tool", "https://example.com/pricing", "gbr", "MOBILE"], clicks: 1, impressions: 20, position: 3 },
		{ keys: ["privacy analytics", "https://example.com/blog/privacy", "deu", "MOBILE"], clicks: 0, impressions: 50, position: 14 },
		{ keys: ["cookieless analytics", "https://example.com/", "usa", "DESKTOP"], clicks: 0, impressions: 30, position: 4 },
	];
	const freshFrom = shiftDate(fakeGoogleLatest(today), -6);
	if (date >= freshFrom) {
		rows.push({ keys: ["fresh keyword", "https://example.com/new", "fra", "TABLET"], clicks: 2, impressions: 10, position: 5 });
	}
	else if (date >= shiftDate(freshFrom, -7)) {
		rows.push({ keys: ["old keyword", "https://example.com/old", "usa", "DESKTOP"], clicks: 1, impressions: 10, position: 6 });
	}
	return rows;
}

// The day's totals also count anonymized queries, which the detailed rows leave out.
export const ANONYMIZED_CLICKS = 1;
export const ANONYMIZED_IMPRESSIONS = 10;

export function fakeGoogleDay(date: string, today = utcToday()) {
	const rows = fakeGoogleRows(date, today);
	return {
		clicks: rows.reduce((sum, row) => sum + row.clicks, 0) + ANONYMIZED_CLICKS,
		impressions: rows.reduce((sum, row) => sum + row.impressions, 0) + ANONYMIZED_IMPRESSIONS,
		position: 5,
	};
}

// Bing's stand-in accepts this key, lists the first site as verified, and reports the last 30 days up to two days ago.
export const BING_API_KEY = "bing-test-api-key";
export const BING_SITE = "https://example.com/";
export const BING_UNVERIFIED_SITE = "https://unverified.example/";
export const BING_DAYS = 30;

export const fakeBingTraffic = { clicks: 2, impressions: 30 };
export const fakeBingQueries = [
	{ query: "analytics tool", clicks: 1, impressions: 15, position: 3 },
	{ query: "bing only keyword", clicks: 1, impressions: 10, position: 6 },
];
export const fakeBingPages = [{ page: "https://example.com/", clicks: 2, impressions: 25, position: 4 }];

export function fakeBingDates(today = utcToday()) {
	const latest = fakeGoogleLatest(today);
	return Array.from({ length: BING_DAYS }, (_, index) => shiftDate(latest, -index)).reverse();
}

// WCF's date format, at midnight Pacific time as Bing sends it.
export function bingDate(date: string) {
	return `/Date(${Date.parse(`${date}T07:00:00Z`)}-0700)/`;
}
