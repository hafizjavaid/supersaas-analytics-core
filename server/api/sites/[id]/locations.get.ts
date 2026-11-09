export default defineEventHandler(async event => dashboardReports["locations"](event, await requireSiteAndRange(event)));
