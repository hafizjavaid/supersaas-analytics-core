import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dateRangeList, shiftDate } from "#layers/core/shared/utils/dates";
import { BACKFILL_DAYS } from "#layers/core/shared/utils/search";
import { BING_API_KEY, BING_SITE, BING_UNVERIFIED_SITE, bingDate, fakeBingDates, fakeBingPages, fakeBingQueries, fakeBingTraffic, fakeGoogleDay, fakeGoogleLatest, fakeGoogleRows, FAKE_SEARCH_PORT, GOOGLE_CODE, GOOGLE_EMPTY_PROPERTY, GOOGLE_PROPERTY, GOOGLE_REFRESH_TOKEN, GOOGLE_REVOKED_CODE, GOOGLE_REVOKED_REFRESH_TOKEN, GOOGLE_UNVERIFIED_PROPERTY, utcToday } from "./search";

const GOOGLE_ACCESS_TOKEN = "google-access-token";

function json(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function googleToken(response: ServerResponse, form: URLSearchParams) {
	const grant = form.get("grant_type");
	if (grant === "authorization_code") {
		const refreshTokens: Record<string, string> = { [GOOGLE_CODE]: GOOGLE_REFRESH_TOKEN, [GOOGLE_REVOKED_CODE]: GOOGLE_REVOKED_REFRESH_TOKEN };
		const refreshToken = refreshTokens[form.get("code") ?? ""];
		if (!refreshToken) {
			return json(response, 400, { error: "invalid_grant", error_description: "Malformed auth code." });
		}
		return json(response, 200, { access_token: GOOGLE_ACCESS_TOKEN, refresh_token: refreshToken, expires_in: 3599, token_type: "Bearer" });
	}
	if (grant === "refresh_token" && form.get("refresh_token") === GOOGLE_REFRESH_TOKEN) {
		return json(response, 200, { access_token: GOOGLE_ACCESS_TOKEN, expires_in: 3599, token_type: "Bearer" });
	}
	json(response, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
}

interface AnalyticsQuery {
	startDate: string;
	endDate: string;
	dimensions: string[];
	rowLimit: number;
	startRow: number;
}

function analyticsRows(property: string, query: AnalyticsQuery) {
	if (property !== GOOGLE_PROPERTY) {
		return [];
	}
	const today = utcToday();
	const from = query.startDate > shiftDate(today, -BACKFILL_DAYS) ? query.startDate : shiftDate(today, -BACKFILL_DAYS);
	const to = query.endDate < fakeGoogleLatest(today) ? query.endDate : fakeGoogleLatest(today);
	const dates = from <= to ? dateRangeList(from, to) : [];
	const rows = query.dimensions.length === 1
		? dates.map(date => ({ keys: [date], ...fakeGoogleDay(date, today) }))
		: dates.flatMap(date => fakeGoogleRows(date, today).map(row => ({ ...row, keys: [date, ...row.keys] })));
	return rows.slice(query.startRow, query.startRow + query.rowLimit);
}

async function google(request: IncomingMessage, response: ServerResponse, url: URL) {
	if (request.headers.authorization !== `Bearer ${GOOGLE_ACCESS_TOKEN}`) {
		return json(response, 401, { error: { code: 401, message: "Request had invalid authentication credentials." } });
	}
	if (request.method === "GET" && url.pathname === "/webmasters/v3/sites") {
		return json(response, 200, {
			siteEntry: [
				{ siteUrl: GOOGLE_PROPERTY, permissionLevel: "siteOwner" },
				{ siteUrl: GOOGLE_EMPTY_PROPERTY, permissionLevel: "siteFullUser" },
				{ siteUrl: GOOGLE_UNVERIFIED_PROPERTY, permissionLevel: "siteUnverifiedUser" },
			],
		});
	}
	const match = /^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(url.pathname);
	if (request.method === "POST" && match) {
		const rows = analyticsRows(decodeURIComponent(match[1]!), JSON.parse(await readBody(request)) as AnalyticsQuery);
		return json(response, 200, rows.length > 0 ? { rows, responseAggregationType: "byProperty" } : { responseAggregationType: "byProperty" });
	}
	json(response, 404, { error: { code: 404, message: "Not found" } });
}

function bing(response: ServerResponse, url: URL) {
	if (url.searchParams.get("apikey") !== BING_API_KEY) {
		return json(response, 400, { ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" });
	}
	const method = url.pathname.slice("/bing/".length);
	if (method === "GetUserSites") {
		return json(response, 200, { d: [{ Url: BING_SITE, IsVerified: true }, { Url: BING_UNVERIFIED_SITE, IsVerified: false }] });
	}
	const dates = url.searchParams.get("siteUrl") === BING_SITE ? fakeBingDates() : [];
	if (method === "GetRankAndTrafficStats") {
		return json(response, 200, { d: dates.map(date => ({ Date: bingDate(date), Clicks: fakeBingTraffic.clicks, Impressions: fakeBingTraffic.impressions })) });
	}
	const stats = { GetQueryStats: fakeBingQueries.map(row => ({ ...row, key: row.query })), GetPageStats: fakeBingPages.map(row => ({ ...row, key: row.page })) }[method];
	if (!stats) {
		return json(response, 404, {});
	}
	json(response, 200, {
		d: dates.flatMap(date => stats.map(row => ({ Query: row.key, Date: bingDate(date), Clicks: row.clicks, Impressions: row.impressions, AvgImpressionPosition: row.position, AvgClickPosition: row.position }))),
	});
}

export async function startFakeSearch() {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://fake-search");
		if (request.method === "POST" && url.pathname === "/token") {
			readBody(request).then(body => googleToken(response, new URLSearchParams(body)));
			return;
		}
		if (request.method === "GET" && url.pathname.startsWith("/bing/")) {
			return bing(response, url);
		}
		if (url.pathname.startsWith("/webmasters/")) {
			google(request, response, url).catch(() => json(response, 500, {}));
			return;
		}
		json(response, 404, {});
	});
	await new Promise<void>(resolve => server.listen(FAKE_SEARCH_PORT, "127.0.0.1", resolve));
	return () => new Promise<void>(resolve => server.close(() => resolve()));
}
