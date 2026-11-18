import { tool } from "ai";
import { z } from "zod";
import { computeFunnel, getFunnel, listFunnels } from "#layers/core/server/db/queries/funnels";
import { computeGoalReport } from "#layers/core/server/db/queries/goals";
import { computeSummary, computeTimeseries } from "#layers/core/server/db/queries/overview";
import { computeConversions, listOrganizationRevenueConnections } from "#layers/core/server/db/queries/revenue";
import { getSiteById, listOrganizationSites } from "#layers/core/server/db/queries/sites";
import { readTopList } from "#layers/core/server/utils/top-list";
import type { TopListOutput } from "#layers/core/shared/utils/ai";
import { REPORT_DESCRIPTIONS, TOP_LIST_DIMENSIONS } from "#layers/core/shared/utils/ai";
import { RANGE_KEYS, resolveRange } from "#layers/core/shared/utils/dates";
import { FILTER_DIMENSIONS, FILTER_EXAMPLES, parseFilters } from "#layers/core/shared/utils/filters";

const ROW_LIMIT = 10;

const rangeSchema = z.object({
	siteId: z.string().describe("The Site's id, from listSites"),
	range: z.enum(RANGE_KEYS).default("30d").describe("today, yesterday, 24h, 7d, 30d, 90d, 6m, 12m, or custom with from and to"),
	from: z.string().optional().describe("YYYY-MM-DD in the Site's timezone, for a custom range"),
	to: z.string().optional().describe("YYYY-MM-DD in the Site's timezone, for a custom range"),
	filters: z.array(z.string()).default([]).describe(`Filters as "dimension:value", such as ${FILTER_EXAMPLES.map(example => `"${example}"`).join(" or ")}. Dimensions: ${FILTER_DIMENSIONS.join(", ")}`),
});

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
			description: REPORT_DESCRIPTIONS.listSites,
			inputSchema: z.object({}),
			execute: async () => ({ sites: sites.map(site => ({ id: site.id, name: site.name, domain: site.domain, timezone: site.timezone })) }),
		}),
		summary: tool({
			description: REPORT_DESCRIPTIONS.summary,
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				return { site: site.name, range, ...await computeSummary(site, range, filters) };
			}),
		}),
		timeseries: tool({
			description: `${REPORT_DESCRIPTIONS.timeseries} The answer shows it as a chart.`,
			inputSchema: rangeSchema,
			execute: refusing(async (input) => {
				const { site, range, filters } = await read(input);
				const points = await computeTimeseries(site, range, filters);
				return { site: site.name, range, points: points.map(point => ({ timestamp: point.timestamp, visitors: point.visitors, pageviews: point.pageviews })) };
			}),
		}),
		topList: tool({
			description: `${REPORT_DESCRIPTIONS.topList} The answer shows it as a ranked list.`,
			inputSchema: rangeSchema.extend({ dimension: z.enum(TOP_LIST_DIMENSIONS) }),
			execute: refusing(async (input): Promise<TopListOutput & { site: string }> => {
				const { site, range, filters } = await read(input);
				const result = await readTopList(site, range, filters, input.dimension);
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
			description: REPORT_DESCRIPTIONS.goals,
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
			description: REPORT_DESCRIPTIONS.payments,
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
