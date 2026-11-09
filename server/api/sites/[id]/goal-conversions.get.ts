export default defineEventHandler(async event => dashboardReports["goal-conversions"](event, await requireSiteAndRange(event)));
