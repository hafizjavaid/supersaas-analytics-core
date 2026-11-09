import type { H3Event } from "h3";

const DEV_ORIGIN = "http://localhost:3001";

// The configured URL, because behind a proxy the request's origin can be an internal host. Scheduled tasks have no
// request, so their links need NUXT_AUTH_URL outside development.
export function appOrigin(event?: H3Event) {
	const configured = useRuntimeConfig().auth.url.replace(/\/$/, "");
	if (configured) {
		return configured;
	}
	if (event) {
		return getRequestURL(event).origin;
	}
	if (!import.meta.dev) {
		throw new Error("NUXT_AUTH_URL must be set for links in emails sent without a request, such as Digests");
	}
	return DEV_ORIGIN;
}
