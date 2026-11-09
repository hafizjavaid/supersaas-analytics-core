export default defineEventHandler(async event => dashboardReports["event-properties"](event, await requireSiteAndRange(event)));
