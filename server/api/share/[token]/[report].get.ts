export default defineEventHandler(async (event) => {
	const name = getRouterParam(event, "report");
	if (!isDashboardReport(name)) {
		throw createError({ statusCode: 404, statusMessage: "Not found" });
	}
	return dashboardReports[name](event, await requireSharedSiteAndRange(event));
});
