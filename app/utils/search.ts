import type { SearchTotals } from "#layers/core/shared/utils/search";
import { clickThroughRate } from "#layers/core/shared/utils/search";
import { formatCompactNumber, formatPercent } from "#layers/core/shared/utils/format";
import type { MetricChange } from "./dashboard-metrics";
import { valueChange } from "./dashboard-metrics";

export function formatPosition(position: number | null) {
	return position === null ? "–" : position.toFixed(1);
}

// Positions count from 1 at the top, so falling is improving.
export function positionChange(current: number, previous: number): MetricChange {
	const delta = Math.round((current - previous) * 10) / 10;
	if (delta === 0) {
		return { label: "0", tone: "neutral" };
	}
	return { label: `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`, tone: delta < 0 ? "success" : "error" };
}

export interface SearchTile {
	label: string;
	value: string;
	change: MetricChange | null;
}

export function searchSummaryTiles(summary: SearchTotals & { previous: SearchTotals }): SearchTile[] {
	const { previous } = summary;
	const ctr = clickThroughRate(summary);
	const previousCtr = clickThroughRate(previous);
	return [
		{ label: "Clicks", value: formatCompactNumber(summary.clicks), change: valueChange(summary.clicks, previous.clicks) },
		{ label: "Impressions", value: formatCompactNumber(summary.impressions), change: valueChange(summary.impressions, previous.impressions) },
		{ label: "CTR", value: formatPercent(ctr), change: previous.impressions > 0 ? valueChange(ctr, previousCtr) : null },
		{
			label: "Avg. position",
			value: formatPosition(summary.position),
			change: summary.position !== null && previous.position !== null ? positionChange(summary.position, previous.position) : null,
		},
	];
}
