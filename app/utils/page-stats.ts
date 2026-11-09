import type { PageStatsSort, SortOrder } from "#layers/core/shared/types/analytics";

export interface PageStatsOrder {
	sort: PageStatsSort;
	order: SortOrder;
}

// Clicking the sorted column flips its order; another column starts A to Z for pages and highest first for numbers.
export function nextPageStatsOrder(current: PageStatsOrder, sort: PageStatsSort): PageStatsOrder {
	if (current.sort === sort) {
		return { sort, order: current.order === "asc" ? "desc" : "asc" };
	}
	return { sort, order: sort === "page" ? "asc" : "desc" };
}

export function pageUrl(domain: string, path: string) {
	return `https://${domain}${path}`;
}

// SVG polyline points scaled to the box, with zero on the bottom edge and the highest value on the top.
export function sparklinePoints(values: number[], width: number, height: number): string {
	if (values.length === 0) {
		return "";
	}
	const max = Math.max(...values, 1);
	const step = values.length > 1 ? width / (values.length - 1) : 0;
	return values
		.map((value, index) => `${round(index * step)},${round(height - (value / max) * height)}`)
		.join(" ");
}

function round(value: number) {
	return Math.round(value * 100) / 100;
}
