export default defineEventHandler(async event => dashboardReports["sources"](event, await requireSiteAndRange(event)));
