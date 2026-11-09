import { z } from "zod";
import type { SearchProperty } from "#layers/core/shared/types/search";
import { searchPath } from "#layers/core/shared/utils/search";
import type { SearchDayInput, SearchRowInput } from "#layers/core/server/db/queries/search";
import { SearchSyncError } from "./search-sync-error";

const BING_API_URL = "https://ssl.bing.com/webmaster/api.svc/json";

const BING_DATE = /^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/;

// Bing's JSON API speaks WCF: `/Date(<ms since epoch><offset>)/`, at midnight Pacific time for daily figures.
export function parseBingDate(value: string): string | null {
	const match = BING_DATE.exec(value);
	return match ? new Date(Number(match[1])).toISOString().slice(0, 10) : null;
}

function bingApi(apiKey: string) {
	return $fetch.create({
		baseURL: useRuntimeConfig().searchConsole.bingApiUrl || BING_API_URL,
		query: { apikey: apiKey },
		timeout: 20_000,
	});
}

function statusOf(error: unknown) {
	return (error as { statusCode?: number } | null)?.statusCode;
}

async function callBing<T>(apiKey: string, method: string, schema: z.ZodType<T>, siteUrl?: string): Promise<T> {
	try {
		return schema.parse(await bingApi(apiKey)(`/${method}`, { query: siteUrl ? { siteUrl } : {} }));
	}
	catch (error) {
		const status = statusOf(error);
		if (status === 400 || status === 401 || status === 403) {
			throw new SearchSyncError("Bing refused this API key. Copy it again from Bing Webmaster Tools → Settings → API access.");
		}
		throw error;
	}
}

const sitesSchema = z.object({ d: z.array(z.object({ Url: z.string(), IsVerified: z.boolean() })).nullish() });

export async function listBingProperties(apiKey: string): Promise<SearchProperty[]> {
	const { d } = await callBing(apiKey, "GetUserSites", sitesSchema);
	return (d ?? [])
		.filter(site => site.IsVerified)
		.map(site => ({ id: site.Url, label: site.Url }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

const statsSchema = z.object({
	d: z.array(z.object({
		Query: z.string(),
		Date: z.string(),
		Clicks: z.number(),
		Impressions: z.number(),
		AvgImpressionPosition: z.number(),
	})).nullish(),
});

const trafficSchema = z.object({
	d: z.array(z.object({ Date: z.string(), Clicks: z.number(), Impressions: z.number() })).nullish(),
});

// Bing returns its last six months in one answer each, without a date range. Queries and pages come apart and without
// country or device, so a query row leaves the page empty and a page row the query. A position of 0 or less means none.
export async function fetchBingData(apiKey: string, siteUrl: string): Promise<{ days: SearchDayInput[]; rows: SearchRowInput[] }> {
	const [queries, pages, traffic] = await Promise.all([
		callBing(apiKey, "GetQueryStats", statsSchema, siteUrl),
		callBing(apiKey, "GetPageStats", statsSchema, siteUrl),
		callBing(apiKey, "GetRankAndTrafficStats", trafficSchema, siteUrl),
	]);

	const rows: SearchRowInput[] = [];
	const positions = new Map<string, { positionSum: number; positionedImpressions: number }>();
	const statRows = (stats: z.infer<typeof statsSchema>, kind: "query" | "page") => {
		for (const stat of stats.d ?? []) {
			const date = parseBingDate(stat.Date);
			if (!date) {
				continue;
			}
			const positionSum = stat.AvgImpressionPosition > 0 ? stat.AvgImpressionPosition * stat.Impressions : 0;
			rows.push({
				date,
				query: kind === "query" ? stat.Query : "",
				page: kind === "page" ? stat.Query : "",
				path: kind === "page" ? searchPath(stat.Query) : "",
				country: "",
				device: "",
				clicks: stat.Clicks,
				impressions: stat.Impressions,
				positionSum,
			});
			if (kind === "query" && positionSum > 0) {
				const day = positions.get(date) ?? { positionSum: 0, positionedImpressions: 0 };
				day.positionSum += positionSum;
				day.positionedImpressions += stat.Impressions;
				positions.set(date, day);
			}
		}
	};
	statRows(queries, "query");
	statRows(pages, "page");

	const days = (traffic.d ?? []).flatMap((day) => {
		const date = parseBingDate(day.Date);
		return date ? [{ date, clicks: day.Clicks, impressions: day.Impressions, ...(positions.get(date) ?? { positionSum: 0, positionedImpressions: 0 }) }] : [];
	});
	return { days, rows };
}
