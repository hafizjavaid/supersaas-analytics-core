export default defineEventHandler(async event => dashboardReports.live(event, { site: await requireSite(event) }));
