import { computeFunnel, listFunnels } from "#layers/core/server/db/queries/funnels";
import { computeGoalReport } from "#layers/core/server/db/queries/goals";
import { computeLiveVisitors } from "#layers/core/server/db/queries/live";
import { computeSummary, computeTimeseries } from "#layers/core/server/db/queries/overview";
import { computeConversions } from "#layers/core/server/db/queries/revenue";
import { listOrganizationSites } from "#layers/core/server/db/queries/sites";
import { apiV1Funnel, apiV1FunnelStep, apiV1Range, apiV1SiteRef } from "#layers/core/server/utils/api-v1";
import { readTopList } from "#layers/core/server/utils/top-list";
import type { ApiV1FunnelReport, ApiV1Funnels, ApiV1Goals, ApiV1Live, ApiV1Payments, ApiV1Sites, ApiV1Summary, ApiV1Timeseries, ApiV1TopList, ApiV1Totals } from "#layers/core/shared/schemas/api-v1";
import type { DashboardSummary, Funnel, Site } from "#layers/core/shared/types/analytics";
import type { ConversionsSummary, RevenueBreakdownRow } from "#layers/core/shared/types/revenue";
import type { TopListDimension } from "#layers/core/shared/utils/ai";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";

// API v1's reports, shared by its HTTP handlers and the MCP tools so both answer the same shapes.

const ROW_LIMIT = 10;

export async function readApiV1Sites(organizationId: string): Promise<ApiV1Sites> {
	const sites = await listOrganizationSites(organizationId);
	return { sites: sites.map(site => ({ id: site.id, name: site.name, domain: site.domain, timezone: site.timezone, createdAt: site.createdAt })) };
}

function summaryTotals(summary: DashboardSummary): ApiV1Totals {
	return {
		visitors: summary.visitors,
		visits: summary.visits,
		pageviews: summary.pageviews,
		bounceRate: summary.bounceRate,
		avgVisitDurationSeconds: summary.avgDurationSeconds,
		conversionRate: summary.conversionRate,
		revenue: summary.revenue,
	};
}

export async function readApiV1Summary(site: Site, range: ResolvedRange, filters: Filter[]): Promise<ApiV1Summary> {
	const summary = await computeSummary(site, range, filters);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		currency: summary.currency,
		current: summaryTotals(summary),
		previous: summaryTotals(summary.previous),
	};
}

export async function readApiV1Timeseries(site: Site, range: ResolvedRange, filters: Filter[]): Promise<ApiV1Timeseries> {
	const points = await computeTimeseries(site, range, filters);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		interval: range.hours || range.fromDate === range.toDate ? "hour" : "day",
		points: points.map(point => ({ timestamp: point.timestamp, visitors: point.visitors, pageviews: point.pageviews })),
	};
}

export async function readApiV1TopList(site: Site, range: ResolvedRange, filters: Filter[], dimension: TopListDimension): Promise<ApiV1TopList> {
	const list = await readTopList(site, range, filters, dimension);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		dimension,
		metric: list.metric,
		total: list.total,
		rows: list.rows.map(row => ({ label: row.label, value: row.value })),
	};
}

export async function readApiV1Goals(site: Site, range: ResolvedRange, filters: Filter[]): Promise<ApiV1Goals> {
	const report = await computeGoalReport(site, range, filters);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		visitors: report.visitors,
		converted: report.converted,
		conversionRate: report.conversionRate,
		goals: report.goals.map(row => ({
			id: row.goal.id,
			name: row.goal.name,
			kind: row.goal.kind,
			value: row.goal.value,
			conversions: row.conversions,
			visitors: row.visitors,
			conversionRate: row.conversionRate,
		})),
	};
}

export async function readApiV1Funnels(site: Site): Promise<ApiV1Funnels> {
	const funnels = await listFunnels(site.id);
	return { site: apiV1SiteRef(site), funnels: funnels.map(apiV1Funnel) };
}

export async function readApiV1FunnelReport(site: Site, range: ResolvedRange, filters: Filter[], funnel: Funnel): Promise<ApiV1FunnelReport> {
	const report = await computeFunnel(site, range, filters, funnel);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		funnel: apiV1Funnel(funnel),
		visitors: report.visitors,
		entered: report.entered,
		completed: report.completed,
		enteredRate: report.enteredRate,
		conversionRate: report.conversionRate,
		steps: report.steps.map(row => ({
			step: apiV1FunnelStep(row.step),
			label: row.label,
			visitors: row.visitors,
			entryRate: row.entryRate,
			continueRate: row.continueRate,
			dropped: row.dropped,
		})),
	};
}

function paymentTotals(summary: ConversionsSummary) {
	return { revenue: summary.revenue, payments: summary.payments, avgOrderValue: summary.avgOrderValue, avgTimeToConvertSeconds: summary.avgTimeToConvertSeconds };
}

function revenueBreakdown(rows: RevenueBreakdownRow[]) {
	return rows.slice(0, ROW_LIMIT).map(row => ({ value: row.value, revenue: row.revenue, payments: row.payments }));
}

// Totals and breakdowns only: individual Payments and customer emails stay in the dashboard.
export async function readApiV1Payments(site: Site, range: ResolvedRange, filters: Filter[], currency: string): Promise<ApiV1Payments> {
	const report = await computeConversions(site, range, filters, currency);
	return {
		site: apiV1SiteRef(site),
		range: apiV1Range(range),
		currency,
		current: paymentTotals(report.summary),
		previous: paymentTotals(report.summary.previous),
		sources: revenueBreakdown(report.sources),
		countries: revenueBreakdown(report.countries),
	};
}

export async function readApiV1Live(site: Site): Promise<ApiV1Live> {
	const live = await computeLiveVisitors(site.id);
	return { site: apiV1SiteRef(site), visitors: live.count };
}
