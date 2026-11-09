export default defineEventHandler(async event => dashboardReports["activity"](event, await requireSiteAndRange(event)));
