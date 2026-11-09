export default defineEventHandler(async event => dashboardReports.funnels(event, { site: await requireSite(event) }));
