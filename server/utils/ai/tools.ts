import { tool } from "ai";
import { z } from "zod";
import { computeFunnel, getFunnel, listFunnels } from "#layers/core/server/db/queries/funnels";
import { computeGoalReport } from "#layers/core/server/db/queries/goals";
import { computeSummary, computeTimeseries } from "#layers/core/server/db/queries/overview";
import { computeConversions, listOrganizationRevenueConnections } from "#layers/core/server/db/queries/revenue";
import { getSiteById, listOrganizationSites } from "#layers/core/server/db/queries/sites";
import { computeTopDevices, computeTopEvents, computeTopLocations, computeTopPages, computeTopSources } from "#layers/core/server/db/queries/top-lists";
import type { Site } from "#layers/core/shared/types/analytics";
import type { TopListDimension, TopListOutput } from "#layers/core/shared/utils/ai";
import { TOP_LIST_DIMENSIONS } from "#layers/core/shared/utils/ai";
import { RANGE_KEYS, resolveRange } from "#layers/core/shared/utils/dates";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { FILTER_DIMENSIONS, parseFilters } from "#layers/core/shared/utils/filters";
import type { Filter } from "#layers/core/shared/utils/filters";

const ROW_LIMIT = 10;

const rangeSchema = z.object({
	siteId: z.string().describe("The Site's id, from listSites"),
	range: z.enum(RANGE_KEYS).default("30d").describe("today, yesterday, 24h, 7d, 30d, 90d, 6m, 12m, or custom with from and to"),
	from: z.string().optional().describe("YYYY-MM-DD in the Site's timezone, for a custom range"),
	to: z.string().optional().describe("YYYY-MM-DD in the Site's timezone, for a custom range"),
	filters: z.array(z.string()).default([]).describe(`Filters as "dimension:value", such as "country:US" or "channel:Search". Dimensions: ${FILTER_DIMENSIONS.join(", ")}`),
});

type TopListReader = (site: Site, range: ResolvedRange, filters: Filter[]) => Promise<Pick<TopListOutput, "metric" | "rows" | "total">>;

function pages(dimension: "top" | "entered" | "exited" | "outbound", metric: TopListOutput["metric"]): TopListReader {
	return async (site, range, filters) => {
		const result = await computeTopPages(site, range, filters, dimension);
		return { metric, rows: result.rows.map(row => ({ label: row.path, value: row.count })), total: result.total };
	};
}

function sources(dimension: Parameters<typeof computeTopSources>[3]): TopListReader {
	return async (site, range, filters) => {
		const result = await computeTopSources(site, range, filters, dimension);
		return { metric: "visits", rows: result.rows.map(row => ({ label: row.label, value: row.visits })), total: result.total };
	};
}

function devices(dimension: Parameters<typeof computeTopDevices>[3]): TopListReader {
	return async (site, range, filters) => {
		const result = await computeTopDevices(site, range, filters, dimension);
		return { metric: "visits", rows: result.rows.map(row => ({ label: row.value, value: row.visits })), total: result.total };
	};
}

function locations(dimension: Parameters<typeof computeTopLocations>[3]): TopListReader {
	const parts = { country: 1, region: 2, city: 3 }[dimension];
	return async (site, range, filters) => {
		const result = await computeTopLocations(site, range, filters, dimension);
		const label = (row: (typeof result.rows)[number]) => [row.country, row.region, row.city].slice(0, parts).filter(Boolean).reverse().join(", ");
		return { metric: "visits", rows: result.rows.map(row => ({ label: label(row), value: row.visits })), total: result.total };
	};
}

const TOP_LISTS: Record<TopListDimension, TopListReader> = {
	page: pages("top", "pageviews"),
	entry_page: pages("entered", "visits"),
	exit_page: pages("exited", "visits"),
	outbound_link: pages("outbound", "clicks"),
	channel: sources("channel"),
	referrer: sources("referrer"),
	ai_assistant: sources("ai"),
	utm_campaign: sources("campaign"),
	utm_medium: sources("medium"),
	utm_term: sources("term"),
	utm_content: sources("content"),
	browser: devices("browser"),
	os: devices("os"),
	device: devices("device"),
	country: locations("country"),
	region: locations("region"),
	city: locations("city"),
	event: async (site, range, filters) => {
		const rows = await computeTopEvents(site, range, filters);
		return {
			metric: "events",
			rows: rows.map(row => ({ label: row.path ? `${row.name} on ${row.path}` : row.name, value: row.count })),
			total: rows.reduce((sum, row) => sum + row.count, 0),
		};
	},
};

class AiToolRefusal extends Error {}

// A Site outside the asking Member's Organization is "not found", like the API's 404.
function readerFor(organizationId: string) {
	return async function read(input: z.infer<typeof rangeSchema>) {
		const site = await getSiteById(input.siteId);
		if (!site || site.organizationId !== organizationId) {
			throw new AiToolRefusal(`Site not found: ${input.siteId}. Call listSites for this Organization's Sites.`);
		}
		return { site, range: resolveRange(input.range, site.timezone, input.from, input.to), filters: parseFilters(input.filters) };
	};
}

// A refusal comes back as the tool's result, so the model can explain it rather than the answer failing.
function refusing<TInput, TOutput>(run: (input: TInput) => Promise<TOutput>) {
	return async (input: TInput): Promise<TOutput | { error: string }> => {
		try {
			return await run(input);
		}
		catch (error) {
			if (error instanceof AiToolRefusal) {
				return { error: error.message };
			}
			throw error;
		}
	};
}

// The model reads analytics only through these, scoped to one Organization; it never writes SQL.
export async function analyticsTools(organizationId: string) {
	const read = readerFor(organizationId);
	const [sites, revenueConnections] = await Promise.all([listOrganizationSites(organizationId), listOrganizationRevenueConnections(organizationId)]);

	const tools = {
		listSites: tool({
			description: "List the Organization's Sites with their ids, domains and timezones.",
			inputSchema: z.object({}),
			execute: async () => ({ sites: sites.map(site => ({ id: site.id, name: site.name, domain: site.domain, timezone: site.timezone })) }),
		}),
		summary: tool({
			description: "Visitors, Visits, Pageviews, bounce rate and visit duration (with conversion rate and Revenue once set up) over a Range, and the same for the previous period.",
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				return { site: site.name, range, ...await computeSummary(site, range, filters) };
			}),
		}),
		timeseries: tool({
			description: "Visitors and Pageviews over a Range, per hour for a single day and per day otherwise. The answer shows it as a chart.",
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				const points = await computeTimeseries(site, range, filters);
				return { site: site.name, range, points: points.map(point => ({ timestamp: point.timestamp, visitors: point.visitors, pageviews: point.pageviews })) };
			}),
		}),
		topList: tool({
			description: "The top values of one dimension over a Range, such as pages, referrers, channels, countries or browsers. The answer shows it as a ranked list.",
			inputSchema: rangeSchema.extend({ dimension: z.enum(TOP_LIST_DIMENSIONS) }),
			execute: refusing(async (input): Promise<TopListOutput & { site: string }> => {
				const { site, range, filters } = await read(input);
				const result = await TOP_LISTS[input.dimension](site, range, filters);
				return { site: site.name, range, dimension: input.dimension, ...result, rows: result.rows.slice(0, ROW_LIMIT) };
			}),
		}),
		funnel: tool({
			description: "Without funnelId, list a Site's Funnels. With it, the Funnel's steps and conversion over a Range.",
			inputSchema: rangeSchema.extend({ funnelId: z.string().optional() }),
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				if (!input.funnelId) {
					return { funnels: (await listFunnels(site.id)).map(funnel => ({ id: funnel.id, name: funnel.name, steps: funnel.steps.length })) };
				}
				const funnel = await getFunnel(site.id, input.funnelId);
				if (!funnel) {
					return { error: `Funnel not found: ${input.funnelId}` };
				}
				return { site: site.name, range, funnel: funnel.name, ...await computeFunnel(site, range, filters, funnel) };
			}),
		}),
		goals: tool({
			description: "Each Goal's conversions, unique Visitors and conversion rate over a Range.",
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				return { site: site.name, range, ...await computeGoalReport(site, range, filters) };
			}),
		}),
	};

	if (revenueConnections.length === 0) {
		return tools;
	}
	return {
		...tools,
		payments: tool({
			description: "Revenue, Payments, average order value and time to convert over a Range, with Revenue by Source and country. Amounts are in the currency's minor unit, such as cents. Only for Sites with a Revenue connection.",
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				const connection = revenueConnections.find(candidate => candidate.siteId === site.id);
				if (!connection) {
					return { error: `${site.name} has no Revenue connection.` };
				}
				const { summary, sources: bySource, countries } = await computeConversions(site, range, filters, connection.currency);
				return { site: site.name, range, currency: connection.currency, summary, sources: bySource.slice(0, ROW_LIMIT), countries: countries.slice(0, ROW_LIMIT) };
			}),
		}),
	};
}
