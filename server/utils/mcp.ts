import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { H3Event } from "h3";
import { z } from "zod";
import { getFunnel } from "#layers/core/server/db/queries/funnels";
import { listOrganizationRevenueConnections } from "#layers/core/server/db/queries/revenue";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { apiKeyRateLimit } from "#layers/core/server/utils/api-key";
import type { requireApiKey } from "#layers/core/server/utils/api-key";
import { readApiV1FunnelReport, readApiV1Funnels, readApiV1Goals, readApiV1Live, readApiV1Payments, readApiV1Sites, readApiV1Summary, readApiV1Timeseries, readApiV1TopList } from "#layers/core/server/utils/api-v1-reports";
import { apiV1FilterSchema, apiV1FunnelReportSchema, apiV1FunnelsSchema, apiV1GoalsSchema, apiV1LiveSchema, apiV1PaymentsSchema, apiV1ReportQuerySchema, apiV1SitesSchema, apiV1SummarySchema, apiV1TimeseriesSchema, apiV1TopListSchema } from "#layers/core/shared/schemas/api-v1";
import { REPORT_DESCRIPTIONS, TOP_LIST_DIMENSIONS } from "#layers/core/shared/utils/ai";
import { resolveRange } from "#layers/core/shared/utils/dates";
import { FILTER_DIMENSIONS, FILTER_EXAMPLES, parseFilters } from "#layers/core/shared/utils/filters";

type McpApiKey = Awaited<ReturnType<typeof requireApiKey>>;

const INSTRUCTIONS = [
	"Read-only web analytics for one Organization's Sites. Start with list_sites for the Site ids.",
	"A Range is the span a report covers: today, yesterday, 24h (rolling, ending now), 7d, 30d, 90d, 6m, 12m, or custom with from and to as YYYY-MM-DD in the Site's timezone.",
	`A Filter narrows a report to the Visits matching a dimension:value, such as ${FILTER_EXAMPLES.join(" or ")}; several Filters must all match.`,
	"A Dimension is one axis top_list breaks traffic down by, such as page, referrer, country or browser.",
].join(" ");

const RANGE_AND_FILTERS = "Takes a Range (default the last 30 days) and optional Filters, which narrow every figure to the Visits matching all of them.";

const siteInput = z.object({
	siteId: z.string().describe("The Site's id, from list_sites"),
});

const reportInput = siteInput.extend({
	range: apiV1ReportQuerySchema.shape.range,
	from: apiV1ReportQuerySchema.shape.from,
	to: apiV1ReportQuerySchema.shape.to,
	filters: z.array(apiV1FilterSchema).default([])
		.describe(`Filters as "dimension:value", such as ${FILTER_EXAMPLES.map(example => `"${example}"`).join(" or ")}. Dimensions: ${FILTER_DIMENSIONS.join(", ")}`),
});

type ReportInput = z.infer<typeof reportInput>;

class McpToolRefusal extends Error {}

function refusal(message: string): CallToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

function report(output: Record<string, unknown>): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
}

// Each tool call counts against the key's rate limit, and going over it comes back as a result the agent can read.
function toolHandler<TInput>(event: H3Event, apiKey: McpApiKey, run: (input: TInput) => Promise<Record<string, unknown>>) {
	return async (input: TInput): Promise<CallToolResult> => {
		const rateLimit = await apiKeyRateLimit(event, apiKey.id);
		if (rateLimit.limited) {
			return refusal(`Too many requests for this API key. Retry in ${rateLimit.retryAfterSeconds} seconds.`);
		}
		try {
			return report(await run(input));
		}
		catch (error) {
			if (error instanceof McpToolRefusal) {
				return refusal(error.message);
			}
			throw error;
		}
	};
}

function siteReader(organizationId: string) {
	async function readSite(siteId: string) {
		const site = await getSiteById(siteId);
		if (!site || site.organizationId !== organizationId) {
			throw new McpToolRefusal(`Site not found: ${siteId}. Call list_sites for this Organization's Sites.`);
		}
		return site;
	}
	async function readSiteAndRange(input: ReportInput) {
		if (input.range === "custom" && !(input.from && input.to)) {
			throw new McpToolRefusal("A custom Range needs from and to.");
		}
		const site = await readSite(input.siteId);
		return { site, range: resolveRange(input.range, site.timezone, input.from, input.to), filters: parseFilters(input.filters) };
	}
	return { readSite, readSiteAndRange };
}

// One server per request (stateless Streamable HTTP), scoped to the key's Organization. The tools are API v1's reports.
export async function analyticsMcpServer(event: H3Event, apiKey: McpApiKey) {
	const organizationId = apiKey.organization.id;
	const { readSite, readSiteAndRange } = siteReader(organizationId);
	const revenueConnections = await listOrganizationRevenueConnections(organizationId);
	const server = new McpServer({ name: "supersaas-analytics", version: "1.0.0" }, { instructions: INSTRUCTIONS });
	const readOnly = (title: string) => ({ title, readOnlyHint: true, openWorldHint: false });

	server.registerTool("list_sites", {
		title: "List sites",
		description: REPORT_DESCRIPTIONS.listSites,
		inputSchema: z.object({}),
		outputSchema: apiV1SitesSchema,
		annotations: readOnly("List sites"),
	}, toolHandler(event, apiKey, async () => await readApiV1Sites(organizationId)));

	server.registerTool("summary", {
		title: "Site summary",
		description: `${REPORT_DESCRIPTIONS.summary} ${RANGE_AND_FILTERS}`,
		inputSchema: reportInput,
		outputSchema: apiV1SummarySchema,
		annotations: readOnly("Site summary"),
	}, toolHandler(event, apiKey, async (input: ReportInput) => {
		const { site, range, filters } = await readSiteAndRange(input);
		return await readApiV1Summary(site, range, filters);
	}));

	server.registerTool("timeseries", {
		title: "Traffic over time",
		description: `${REPORT_DESCRIPTIONS.timeseries} ${RANGE_AND_FILTERS}`,
		inputSchema: reportInput,
		outputSchema: apiV1TimeseriesSchema,
		annotations: readOnly("Traffic over time"),
	}, toolHandler(event, apiKey, async (input: ReportInput) => {
		const { site, range, filters } = await readSiteAndRange(input);
		return await readApiV1Timeseries(site, range, filters);
	}));

	const topListInput = reportInput.extend({
		dimension: z.enum(TOP_LIST_DIMENSIONS).describe("The Dimension to rank, the axis traffic is broken down by"),
	});
	server.registerTool("top_list", {
		title: "Top list",
		description: `${REPORT_DESCRIPTIONS.topList} Gives the ten largest values of the Dimension. ${RANGE_AND_FILTERS}`,
		inputSchema: topListInput,
		outputSchema: apiV1TopListSchema,
		annotations: readOnly("Top list"),
	}, toolHandler(event, apiKey, async (input: z.infer<typeof topListInput>) => {
		const { site, range, filters } = await readSiteAndRange(input);
		return await readApiV1TopList(site, range, filters, input.dimension);
	}));

	server.registerTool("goals", {
		title: "Goal conversions",
		description: `${REPORT_DESCRIPTIONS.goals} ${RANGE_AND_FILTERS}`,
		inputSchema: reportInput,
		outputSchema: apiV1GoalsSchema,
		annotations: readOnly("Goal conversions"),
	}, toolHandler(event, apiKey, async (input: ReportInput) => {
		const { site, range, filters } = await readSiteAndRange(input);
		return await readApiV1Goals(site, range, filters);
	}));

	server.registerTool("funnels", {
		title: "List funnels",
		description: "List a Site's Funnels with their steps. Pass a Funnel's id to the funnel tool for its conversion.",
		inputSchema: siteInput,
		outputSchema: apiV1FunnelsSchema,
		annotations: readOnly("List funnels"),
	}, toolHandler(event, apiKey, async (input: z.infer<typeof siteInput>) => await readApiV1Funnels(await readSite(input.siteId))));

	const funnelInput = reportInput.extend({ funnelId: z.string().describe("The Funnel's id, from the funnels tool") });
	server.registerTool("funnel", {
		title: "Funnel conversion",
		description: `A Funnel's steps and conversion over a Range: how many people entered, continued and completed. ${RANGE_AND_FILTERS}`,
		inputSchema: funnelInput,
		outputSchema: apiV1FunnelReportSchema,
		annotations: readOnly("Funnel conversion"),
	}, toolHandler(event, apiKey, async (input: z.infer<typeof funnelInput>) => {
		const { site, range, filters } = await readSiteAndRange(input);
		const funnel = await getFunnel(site.id, input.funnelId);
		if (!funnel) {
			throw new McpToolRefusal(`Funnel not found: ${input.funnelId}. Call funnels for this Site's Funnels.`);
		}
		return await readApiV1FunnelReport(site, range, filters, funnel);
	}));

	if (revenueConnections.length > 0) {
		server.registerTool("payments", {
			title: "Revenue",
			description: `${REPORT_DESCRIPTIONS.payments} ${RANGE_AND_FILTERS}`,
			inputSchema: reportInput,
			outputSchema: apiV1PaymentsSchema,
			annotations: readOnly("Revenue"),
		}, toolHandler(event, apiKey, async (input: ReportInput) => {
			const { site, range, filters } = await readSiteAndRange(input);
			const connection = revenueConnections.find(candidate => candidate.siteId === site.id);
			if (!connection) {
				throw new McpToolRefusal(`${site.name} has no Revenue connection.`);
			}
			return await readApiV1Payments(site, range, filters, connection.currency);
		}));
	}

	server.registerTool("live", {
		title: "Live visitors",
		description: "How many Visitors are on a Site now: those seen in the last 5 minutes.",
		inputSchema: siteInput,
		outputSchema: apiV1LiveSchema,
		annotations: readOnly("Live visitors"),
	}, toolHandler(event, apiKey, async (input: z.infer<typeof siteInput>) => await readApiV1Live(await readSite(input.siteId))));

	return server;
}
