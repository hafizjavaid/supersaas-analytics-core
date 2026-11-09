export default defineEventHandler((event) => {
	setResponseHeaders(event, COLLECT_CORS_HEADERS);
	setResponseStatus(event, 204);
	return null;
});
