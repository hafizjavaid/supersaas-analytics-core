import type { RangeKey } from "#layers/core/shared/utils/dates";
import { isRangeKey } from "#layers/core/shared/utils/dates";

export interface DashboardRange {
	key: RangeKey;
	from?: string;
	to?: string;
}

export type ReportQuery = Record<string, string | string[]>;

export const RANGE_OPTIONS: { value: RangeKey; label: string; comparison: string }[] = [
	{ value: "today", label: "Today", comparison: "vs. yesterday at this time" },
	{ value: "yesterday", label: "Yesterday", comparison: "vs. the day before" },
	{ value: "24h", label: "Last 24 hours", comparison: "vs. the 24 hours before" },
	{ value: "7d", label: "Last 7 days", comparison: "vs. the 7 days before" },
	{ value: "30d", label: "Last 30 days", comparison: "vs. the 30 days before" },
	{ value: "90d", label: "Last 90 days", comparison: "vs. the 90 days before" },
	{ value: "6m", label: "Last 6 months", comparison: "vs. the 6 months before" },
	{ value: "12m", label: "Last 12 months", comparison: "vs. the 12 months before" },
	{ value: "custom", label: "Custom range", comparison: "vs. the same number of days before" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function queryDate(value: unknown) {
	return typeof value === "string" && DATE_PATTERN.test(value) ? value : undefined;
}

// A custom Range without both dates is not shareable, so it falls back to the default like an unknown key.
export function readDashboardRange(query: Record<string, unknown>): DashboardRange {
	const key = isRangeKey(query.range) ? query.range : "30d";
	if (key !== "custom") {
		return { key };
	}
	const from = queryDate(query.from);
	const to = queryDate(query.to);
	return from && to ? { key, from, to } : { key: "30d" };
}

export function rangeReportQuery(range: DashboardRange): ReportQuery {
	return range.key === "custom" && range.from && range.to
		? { range: range.key, from: range.from, to: range.to }
		: { range: range.key };
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function rangeLabel(range: DashboardRange): string {
	if (range.key === "custom" && range.from && range.to) {
		const [from, to] = [range.from, range.to].sort();
		return from === to
			? shortDate.format(new Date(`${from}T00:00:00Z`))
			: shortDate.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
	}
	return RANGE_OPTIONS.find(option => option.value === range.key)!.label;
}

export function comparisonLabel(range: DashboardRange): string {
	return RANGE_OPTIONS.find(option => option.value === range.key)!.comparison;
}
