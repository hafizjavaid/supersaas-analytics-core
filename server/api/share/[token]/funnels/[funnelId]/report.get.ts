export default defineEventHandler(async event => funnelReport(event, await requireSharedSiteAndRange(event)));
