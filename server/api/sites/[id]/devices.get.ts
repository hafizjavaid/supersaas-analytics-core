export default defineEventHandler(async event => dashboardReports["devices"](event, await requireSiteAndRange(event)));
