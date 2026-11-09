export default defineEventHandler(async event => dashboardReports["page-stats"](event, await requireSiteAndRange(event)));
