function parseUrl(url: string) {
	return URL.canParse(url) ? new URL(url) : null;
}

export function outboundLinkLabel(url: string) {
	const parsed = parseUrl(url);
	return parsed ? `${parsed.host}${parsed.pathname.replace(/\/$/, "")}` : url;
}

export function outboundLinkHost(url: string) {
	return parseUrl(url)?.host ?? "";
}
