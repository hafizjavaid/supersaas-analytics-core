export default defineEventHandler(async event => dashboardReports.funnels(event, await requireSharedSiteAndRange(event)));
