import { renderBadgeOfToken } from "#layers/core/server/utils/badges";
import { edgeCache, withEdgeCache } from "#layers/core/server/utils/edge-cache";
import { badgeImagePath, readBadgeOptions } from "#layers/core/shared/utils/badges";

const SVG_TYPE = "image/svg+xml; charset=utf-8";

// Malformed percent-encoding names no Share link, so it reads as an unknown token rather than a 500.
function decodeToken(encoded: string) {
	try {
		return decodeURIComponent(encoded);
	}
	catch {
		return "";
	}
}

// Anonymous: it reads the Site's 30-day Visitors only, records nothing, sets no cookie and counts toward no Quota.
export default defineEventHandler(async (event) => {
	const file = getRouterParam(event, "file") ?? "";
	if (!file.endsWith(".svg")) {
		throw createError({ statusCode: 404, statusMessage: "Not found" });
	}
	const token = decodeToken(file.slice(0, -".svg".length));
	const options = readBadgeOptions(getQuery(event));
	const { body, maxAgeSeconds } = await withEdgeCache({
		cache: edgeCache(),
		// Built from the parsed options, so extra query parameters cannot bypass the cache.
		key: `${getRequestURL(event).origin}${badgeImagePath(encodeURIComponent(token), options.theme, options.size)}`,
		contentType: SVG_TYPE,
		produce: async () => {
			const { svg, maxAgeSeconds } = await renderBadgeOfToken(token, options);
			return { body: svg, maxAgeSeconds };
		},
		defer: promise => event.waitUntil(promise),
	});
	setHeaders(event, {
		"content-type": SVG_TYPE,
		"cache-control": `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
		"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
		"x-content-type-options": "nosniff",
	});
	return body;
});
