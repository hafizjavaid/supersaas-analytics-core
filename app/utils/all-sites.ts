import type { AllSitesOverview, SiteOverview, TrafficTotals } from "#layers/core/shared/types/analytics";
import { formatCompactNumber } from "#layers/core/shared/utils/format";
import { formatRevenue } from "#layers/core/shared/utils/revenue";
import type { MetricChange } from "./dashboard-metrics";

export function absoluteChange(current: number, previous: number, format: (value: number) => string = formatCompactNumber): MetricChange {
	const delta = current - previous;
	if (delta === 0) {
		return { label: "0", tone: "neutral" };
	}
	const sign = delta > 0 ? "+" : "−";
	return { label: `${sign}${format(Math.abs(delta))}`, tone: delta > 0 ? "success" : "error" };
}

export interface OverviewCell {
	key: string;
	label: string;
	value: string;
	period?: string;
	change?: MetricChange;
	trend?: number[];
}

const TRAFFIC_CELLS: { key: keyof TrafficTotals; label: string }[] = [
	{ key: "visitors", label: "Visitors" },
	{ key: "pageviews", label: "Pageviews" },
];

function searchClicksCell(entry: SiteOverview): OverviewCell[] {
	if (entry.searchClicks === null) {
		return [];
	}
	return [{ key: "searchClicks", label: "Search clicks", value: formatCompactNumber(entry.searchClicks), period: "28d", change: absoluteChange(entry.searchClicks, entry.previous.searchClicks) }];
}

export function siteOverviewCells(entry: SiteOverview): OverviewCell[] {
	const trafficCells = TRAFFIC_CELLS.map(({ key, label }) => ({
		key,
		label,
		value: formatCompactNumber(entry[key]),
		period: "24h",
		change: absoluteChange(entry[key], entry.previous[key]),
		trend: entry.trend.map(point => point[key]),
	}));
	if (entry.revenue === null || !entry.currency) {
		return [...trafficCells, ...searchClicksCell(entry)];
	}
	const currency = entry.currency;
	const format = (amount: number) => formatRevenue(amount, currency);
	return [
		...trafficCells,
		{ key: "revenue", label: "Revenue", value: format(entry.revenue), period: "24h", change: absoluteChange(entry.revenue, entry.previous.revenue, format) },
		...searchClicksCell(entry),
	];
}

export function overviewTotalCells(totals: AllSitesOverview["totals"]): OverviewCell[] {
	return [
		...TRAFFIC_CELLS.map(({ key, label }) => ({
			key,
			label,
			value: formatCompactNumber(totals[key]),
			period: "24h",
			change: absoluteChange(totals[key], totals.previous[key]),
		})),
		...(totals.revenue.length > 0
			? [{ key: "revenue", label: "Revenue", value: totals.revenue.map(({ currency, amount }) => formatRevenue(amount, currency)).join(" · "), period: "24h" }]
			: []),
		...(totals.searchClicks !== null ? [{ key: "searchClicks", label: "Search clicks", value: formatCompactNumber(totals.searchClicks), period: "28d" }] : []),
		{ key: "live", label: "Live", value: formatCompactNumber(totals.live) },
	];
}
