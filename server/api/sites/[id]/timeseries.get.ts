export default defineEventHandler(async event => dashboardReports["timeseries"](event, await requireSiteAndRange(event)));
