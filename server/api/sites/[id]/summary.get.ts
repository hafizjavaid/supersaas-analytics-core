export default defineEventHandler(async event => dashboardReports["summary"](event, await requireSiteAndRange(event)));
