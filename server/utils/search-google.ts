import { z } from "zod";
import type { SearchProperty } from "#layers/core/shared/types/search";
import { countryOfAlpha3 } from "#layers/core/shared/utils/countries";
import type { SyncChunk } from "#layers/core/shared/utils/search";
import { searchPath } from "#layers/core/shared/utils/search";
import type { SearchDayInput, SearchRowInput } from "#layers/core/server/db/queries/search";
import { SearchSyncError } from "./search-sync-error";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_URL = "https://www.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ROW_LIMIT = 25_000;

// Search Console's own OAuth client, or the sign-in one, since both usually live in the same Google Cloud project.
function googleClient() {
	const { searchConsole, auth } = useRuntimeConfig();
	return {
		clientId: searchConsole.googleClientId || auth.googleClientId,
		clientSecret: searchConsole.googleClientSecret || auth.googleClientSecret,
		oauthUrl: searchConsole.googleOauthUrl || GOOGLE_OAUTH_URL,
		tokenUrl: searchConsole.googleTokenUrl || GOOGLE_TOKEN_URL,
		apiUrl: searchConsole.googleApiUrl || GOOGLE_API_URL,
	};
}

export function isGoogleConfigured() {
	const { clientId, clientSecret } = googleClient();
	return Boolean(clientId && clientSecret);
}

// `prompt=consent` makes Google return a refresh token even to someone who connected before.
export function googleAuthorizeUrl(state: string, redirectUri: string) {
	const { clientId, oauthUrl } = googleClient();
	const url = new URL(oauthUrl);
	url.search = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: SCOPE,
		access_type: "offline",
		prompt: "consent",
		include_granted_scopes: "true",
		state,
	}).toString();
	return url.toString();
}

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional() });

async function requestToken(fields: Record<string, string>) {
	const { clientId, clientSecret, tokenUrl } = googleClient();
	const response = await $fetch(tokenUrl, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...fields }).toString(),
		timeout: 10_000,
	});
	return tokenSchema.parse(response);
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<string> {
	const token = await requestToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
	if (!token.refresh_token) {
		throw new Error("Google returned no refresh token");
	}
	return token.refresh_token;
}

function statusOf(error: unknown) {
	return (error as { statusCode?: number } | null)?.statusCode;
}

async function googleAccessToken(refreshToken: string) {
	try {
		return (await requestToken({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
	}
	catch (error) {
		if (statusOf(error) === 400 || statusOf(error) === 401) {
			throw new SearchSyncError("Google access was revoked. Connect Search Console again.");
		}
		throw error;
	}
}

function googleApi(accessToken: string) {
	return $fetch.create({ baseURL: googleClient().apiUrl, headers: { authorization: `Bearer ${accessToken}` }, timeout: 20_000 });
}

const sitesSchema = z.object({
	siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string() })).optional(),
});

// Unverified properties answer no Search Analytics queries.
export async function listGoogleProperties(refreshToken: string): Promise<SearchProperty[]> {
	const { siteEntry = [] } = sitesSchema.parse(await googleApi(await googleAccessToken(refreshToken))("/sites"));
	return siteEntry
		.filter(entry => entry.permissionLevel !== "siteUnverifiedUser")
		.map(entry => ({ id: entry.siteUrl, label: entry.siteUrl.replace(/^sc-domain:/, "Domain: ") }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

const analyticsSchema = z.object({
	rows: z.array(z.object({
		keys: z.array(z.string()),
		clicks: z.number(),
		impressions: z.number(),
		position: z.number(),
	})).optional(),
});

type AnalyticsRow = NonNullable<z.infer<typeof analyticsSchema>["rows"]>[number];

async function queryAnalytics(accessToken: string, property: string, chunk: SyncChunk, dimensions: string[]) {
	const rows: AnalyticsRow[] = [];
	for (let startRow = 0; ; startRow += ROW_LIMIT) {
		const page = analyticsSchema.parse(await googleApi(accessToken)(`/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
			method: "POST",
			body: { startDate: chunk.from, endDate: chunk.to, dimensions, type: "web", dataState: "all", rowLimit: ROW_LIMIT, startRow },
		}));
		rows.push(...page.rows ?? []);
		if ((page.rows?.length ?? 0) < ROW_LIMIT) {
			return rows;
		}
	}
}

// The date-only query counts the anonymized queries that the detailed one leaves out, so it gives the daily totals.
export async function fetchGoogleChunk(refreshToken: string, property: string, chunk: SyncChunk): Promise<{ days: SearchDayInput[]; rows: SearchRowInput[] }> {
	const accessToken = await googleAccessToken(refreshToken);
	const [dayRows, detailRows] = await Promise.all([
		queryAnalytics(accessToken, property, chunk, ["date"]),
		queryAnalytics(accessToken, property, chunk, ["date", "query", "page", "country", "device"]),
	]);
	return {
		days: dayRows.map(({ keys: [date], clicks, impressions, position }) => ({
			date: date!,
			clicks,
			impressions,
			positionSum: position * impressions,
			positionedImpressions: impressions,
		})),
		rows: detailRows.map(({ keys: [date, query, page, country, device], clicks, impressions, position }) => ({
			date: date!,
			query: query!,
			page: page!,
			path: searchPath(page!),
			country: countryOfAlpha3(country!),
			device: device!.toLowerCase(),
			clicks,
			impressions,
			positionSum: position * impressions,
		})),
	};
}
