import type { DashboardSummary } from "#layers/core/shared/types/analytics";
import { formatChange, formatCompactNumber, formatDuration, formatPercent, percentChange } from "#layers/core/shared/utils/format";
import { formatRevenue } from "#layers/core/shared/utils/revenue";

export type DashboardMetric = "visitors" | "pageviews" | "revenue" | "bounceRate" | "avgDurationSeconds" | "conversionRate";

export type MetricAxis = "count" | "money" | "rate" | "duration" | "conversion";

export interface MetricDefinition {
	key: DashboardMetric;
	label: string;
	themeColor: "info" | "primary" | "warning" | "neutral" | "success";
	dotClass: string;
	axis: MetricAxis;
	higherIsBetter: boolean;
	// `currency` is the Revenue connection's, used by Revenue only.
	format: (value: number, currency?: string | null) => string;
}

export const DASHBOARD_METRICS: MetricDefinition[] = [
	{ key: "visitors", label: "Visitors", themeColor: "info", dotClass: "bg-info", axis: "count", higherIsBetter: true, format: formatCompactNumber },
	{ key: "pageviews", label: "Pageviews", themeColor: "primary", dotClass: "bg-primary", axis: "count", higherIsBetter: true, format: formatCompactNumber },
	{ key: "revenue", label: "Revenue", themeColor: "success", dotClass: "bg-success", axis: "money", higherIsBetter: true, format: (value, currency) => formatRevenue(value, currency ?? "usd") },
	{ key: "bounceRate", label: "Bounce rate", themeColor: "warning", dotClass: "bg-warning", axis: "rate", higherIsBetter: false, format: formatPercent },
	{ key: "avgDurationSeconds", label: "Visit duration", themeColor: "neutral", dotClass: "bg-inverted/40", axis: "duration", higherIsBetter: true, format: formatDuration },
	{ key: "conversionRate", label: "Conversion rate", themeColor: "success", dotClass: "bg-success", axis: "conversion", higherIsBetter: true, format: formatPercent },
];

// Conversion rate only means something once the Site has a Goal, and Revenue once it has a Revenue connection.
export function shownMetrics(summary: DashboardSummary | null | undefined): MetricDefinition[] {
	return DASHBOARD_METRICS.filter(metric => (metric.key !== "conversionRate" && metric.key !== "revenue") || (summary?.[metric.key] ?? null) !== null);
}

export const DEFAULT_CHART_METRICS: DashboardMetric[] = ["visitors", "pageviews"];

export interface MetricChange {
	label: string;
	tone: "success" | "error" | "neutral";
}

export function valueChange(current: number, previous: number, higherIsBetter = true): MetricChange | null {
	const change = percentChange(current, previous);
	if (change === null) {
		return null;
	}
	const label = formatChange(change);
	if (label === "0%") {
		return { label, tone: "neutral" };
	}
	const improved = (change > 0) === higherIsBetter;
	return { label, tone: improved ? "success" : "error" };
}

export function metricChange(metric: MetricDefinition, current: DashboardSummary, previous: DashboardSummary): MetricChange | null {
	const [now, before] = [current[metric.key], previous[metric.key]];
	return now === null || before === null ? null : valueChange(now, before, metric.higherIsBetter);
}

export const CHANGE_PILL_CLASSES: Record<MetricChange["tone"], string> = {
	success: "bg-success/10 text-success",
	error: "bg-error/10 text-error",
	neutral: "bg-elevated text-muted",
};

// At least one series stays on, so the chart is never empty.
export function toggleMetric(selected: DashboardMetric[], metric: DashboardMetric): DashboardMetric[] {
	if (!selected.includes(metric)) {
		return DASHBOARD_METRICS.map(definition => definition.key).filter(key => key === metric || selected.includes(key));
	}
	return selected.length > 1 ? selected.filter(key => key !== metric) : selected;
}
