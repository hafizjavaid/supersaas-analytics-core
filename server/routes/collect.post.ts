// Always 204, even for a bad body or an unknown Site: an ingestion problem must never surface in a Visitor's browser.
export default defineEventHandler(async (event) => {
	const data = await readCollectRequest(event);
	if (data) {
		const context = await readHitContext(event, data.site_id);
		setResponseHeader(event, VISITOR_ID_HEADER, context.visitorId);
		event.waitUntil(recordHit(data, context).catch(error => console.error("[collect]", error)));
	}
	setResponseHeaders(event, COLLECT_CORS_HEADERS);
	setResponseStatus(event, 204);
	return null;
});
