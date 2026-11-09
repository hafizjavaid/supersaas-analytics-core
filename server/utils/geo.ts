import type { H3Event } from "h3";

export interface GeoInfo {
	country: string;
	region: string | null;
	city: string | null;
	latitude: number | null;
	longitude: number | null;
}

interface CloudflareGeo {
	country?: string;
	regionCode?: string;
	region?: string;
	city?: string;
	latitude?: string;
	longitude?: string;
}

function parseCoordinate(value: string | undefined, limit: number): number | null {
	if (!value) {
		return null;
	}
	const coordinate = Number(value);
	return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
}

function decodedHeader(event: H3Event, name: string): string | undefined {
	const value = getRequestHeader(event, name);
	return value ? decodeURIComponent(value) : undefined;
}

function forwardedGeo(event: H3Event): GeoInfo | null {
	const country = getRequestHeader(event, "x-vercel-ip-country");
	const region = decodedHeader(event, "x-vercel-ip-country-region");
	const city = decodedHeader(event, "x-vercel-ip-city");
	const latitude = getRequestHeader(event, "x-vercel-ip-latitude");
	const longitude = getRequestHeader(event, "x-vercel-ip-longitude");
	if (!country && !region && !city && !latitude && !longitude) {
		return null;
	}
	return {
		country: country || "XX",
		region: region ?? null,
		city: city ?? null,
		latitude: parseCoordinate(latitude, 90),
		longitude: parseCoordinate(longitude, 180),
	};
}

// Vercel sends geo as `x-vercel-ip-*` headers, and a Site's own proxy (/docs/getting-started/proxying) forwards the
// visitor's under the same names. They win over `request.cf`, which through a proxy describes the proxy. Browsers cannot
// send them: /collect allows no request headers beyond Content-Type.
export function extractGeo(event: H3Event): GeoInfo {
	const forwarded = forwardedGeo(event);
	if (forwarded) {
		return forwarded;
	}
	const cf = event.context.cf as CloudflareGeo | undefined;
	return {
		country: cf?.country || getRequestHeader(event, "cf-ipcountry") || "XX",
		region: cf?.regionCode ?? cf?.region ?? null,
		city: cf?.city ?? null,
		latitude: parseCoordinate(cf?.latitude, 90),
		longitude: parseCoordinate(cf?.longitude, 180),
	};
}

const NON_PUBLIC_RANGES = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"];

// A proxy in front of /collect, such as a Site's own (/docs/getting-started/proxying), names the visitor first in
// X-Forwarded-For, while cf-connecting-ip is the proxy. Private and loopback entries come from infrastructure, like
// `nuxt dev`'s own proxy, and are skipped. A non-browser client can set the header, but it could send any hit anyway.
export function getClientIp(event: H3Event): string {
	return forwardedPublicIp(event)
		?? getRequestHeader(event, "cf-connecting-ip")
		?? getRequestIP(event)
		?? "0.0.0.0";
}

function forwardedPublicIp(event: H3Event) {
	const first = getRequestHeader(event, "x-forwarded-for")?.split(",")[0]?.trim();
	return first && normalizeIpRule(first) && !ipMatchesAnyRule(first, NON_PUBLIC_RANGES) ? first : undefined;
}
