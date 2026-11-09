import type { H3Event } from "h3";
import { computeEventProperties } from "#layers/core/server/db/queries/event-properties";
import { computeFunnel, getFunnel, listFunnels } from "#layers/core/server/db/queries/funnels";
import { computeGoalReport } from "#layers/core/server/db/queries/goals";
import { computeLiveVisitors } from "#layers/core/server/db/queries/live";
import { computeSummary, computeTimeseries } from "#layers/core/server/db/queries/overview";
import { computePageStats } from "#layers/core/server/db/queries/page-stats";
import { computeTopDevices, computeTopEvents, computeTopLocations, computeTopPages, computeTopSources } from "#layers/core/server/db/queries/top-lists";
import { eventPropertiesQuerySchema } from "#layers/core/shared/schemas/events";
import type { FunnelResults } from "#layers/core/shared/types/analytics";
import { DEVICE_DIMENSIONS, LOCATION_DIMENSIONS, PAGE_DIMENSIONS, PAGE_STATS_SORTS, SOURCE_DIMENSIONS } from "#layers/core/shared/types/analytics";

type ReportContext = ReturnType<typeof readRangeAndFilters>;

const MAX_PAGE_SEARCH_LENGTH = 200;

// Shared by the Site routes and Share links: every report here is readable by anyone with a Share link, so never add
// one that shows individual Visitors (Users, journeys, the realtime list) or settings.
export const dashboardReports = {
	"summary": async (_event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeSummary(site, range, filters) }),
	"timeseries": async (_event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, points: await computeTimeseries(site, range, filters) }),
	"pages": async (event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeTopPages(site, range, filters, readDimension(event, PAGE_DIMENSIONS)) }),
	"sources": async (event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeTopSources(site, range, filters, readDimension(event, SOURCE_DIMENSIONS)) }),
	"devices": async (event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeTopDevices(site, range, filters, readDimension(event, DEVICE_DIMENSIONS)) }),
	"locations": async (event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeTopLocations(site, range, filters, readDimension(event, LOCATION_DIMENSIONS)) }),
	"activity": async (_event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, rows: await computeTopEvents(site, range, filters) }),
	"goal-conversions": async (_event: H3Event, { site, range, filters }: ReportContext) =>
		({ range, ...await computeGoalReport(site, range, filters) }),
	// `?q=` searches paths and titles; `?sort=` (views by default) and `?order=` (desc by default) pick the hundred rows shown.
	"page-stats": async (event: H3Event, { site, range, filters }: ReportContext) => {
		const query = getQuery(event);
		return {
			range,
			...await computePageStats(site, range, filters, {
				search: typeof query.q === "string" ? query.q.trim().slice(0, MAX_PAGE_SEARCH_LENGTH) : "",
				sort: PAGE_STATS_SORTS.find(sort => sort === query.sort) ?? "views",
				order: query.order === "asc" ? "asc" : "desc",
			}),
		};
	},
	"event-properties": (event: H3Event, { site, range, filters }: ReportContext) => {
		const parsed = eventPropertiesQuerySchema.safeParse(getQuery(event));
		if (!parsed.success) {
			throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
		}
		return computeEventProperties(site, range, filters, parsed.data.name, parsed.data.path);
	},
	"live": (_event: H3Event, { site }: Pick<ReportContext, "site">) => computeLiveVisitors(site.id),
	"funnels": (_event: H3Event, { site }: Pick<ReportContext, "site">) => listFunnels(site.id),
};

export type DashboardReportName = keyof typeof dashboardReports;

export function isDashboardReport(name: string | undefined): name is DashboardReportName {
	return !!name && Object.hasOwn(dashboardReports, name);
}

export async function funnelReport(event: H3Event, { site, range, filters }: ReportContext): Promise<FunnelResults> {
	const funnel = await getFunnel(site.id, getRouterParam(event, "funnelId") ?? "");
	if (!funnel) {
		throw funnelNotFound();
	}
	return { range, ...await computeFunnel(site, range, filters, funnel) };
}
