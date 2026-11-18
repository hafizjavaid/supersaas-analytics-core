import type { DeviceDimension, LocationDimension, PageDimension, SourceDimension, TopDeviceRow, TopEventRow, TopLocationRow, TopPageRow, TopSourceRow } from "#layers/core/shared/types/analytics";
import type { Filter, FilterDimension } from "#layers/core/shared/utils/filters";

// The live demo records these same Filters as its Common Filters.

// Outbound links are not a Dimension of a Visit, so their rows do not filter.
const PAGE_FILTER_DIMENSIONS: Record<PageDimension, FilterDimension | undefined> = { top: "page", entered: "entry_page", exited: "exit_page", outbound: undefined };

const SOURCE_FILTER_DIMENSIONS: Record<SourceDimension, FilterDimension> = {
	channel: "channel",
	referrer: "referrer",
	ai: "ai_assistant",
	campaign: "utm_campaign",
	medium: "utm_medium",
	term: "utm_term",
	content: "utm_content",
};

export function pageRowFilter(row: TopPageRow, view: PageDimension): Filter | undefined {
	const dimension = PAGE_FILTER_DIMENSIONS[view];
	return dimension && { dimension, value: row.path };
}

export function sourceRowFilter(row: TopSourceRow, view: SourceDimension): Filter {
	return { dimension: SOURCE_FILTER_DIMENSIONS[view], value: row.key };
}

export function deviceRowFilter(row: TopDeviceRow, view: DeviceDimension): Filter {
	return { dimension: view, value: row.value };
}

export function locationRowFilter(row: TopLocationRow, view: LocationDimension): Filter {
	if (view === "city") {
		return { dimension: view, value: `${row.country}-${row.city}` };
	}
	if (view === "region") {
		return { dimension: view, value: `${row.country}-${row.region}` };
	}
	return { dimension: view, value: row.country };
}

export function eventRowFilter(row: Pick<TopEventRow, "name">): Filter {
	return { dimension: "event", value: row.name };
}
