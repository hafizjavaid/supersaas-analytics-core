export default defineEventHandler(async event => dashboardReports["pages"](event, await requireSiteAndRange(event)));
