export default defineEventHandler(async event => funnelReport(event, await requireSiteAndRange(event)));
