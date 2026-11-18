import { computeTopDevices, computeTopEvents, computeTopLocations, computeTopPages, computeTopSources } from "#layers/core/server/db/queries/top-lists";
import type { Site } from "#layers/core/shared/types/analytics";
import type { TopListDimension, TopListOutput } from "#layers/core/shared/utils/ai";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";

export type TopListRows = Pick<TopListOutput, "metric" | "rows" | "total">;

type TopListReader = (site: Site, range: ResolvedRange, filters: Filter[]) => Promise<TopListRows>;

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

export function readTopList(site: Site, range: ResolvedRange, filters: Filter[], dimension: TopListDimension) {
	return TOP_LISTS[dimension](site, range, filters);
}
