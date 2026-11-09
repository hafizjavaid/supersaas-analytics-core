export interface ParsedUserAgent {
	browser: string;
	os: string;
	deviceType: "desktop" | "mobile" | "tablet";
}

// Order matters: Edge, Opera and Samsung all also claim Chrome and Safari.
const BROWSER_PATTERNS: [RegExp, string][] = [
	[/Edg\//, "Edge"],
	[/OPR\//, "Opera"],
	[/SamsungBrowser/, "Samsung Internet"],
	[/Firefox\//, "Firefox"],
	[/CriOS/, "Chrome"],
	[/Chrome\//, "Chrome"],
	[/Safari\//, "Safari"],
	[/MSIE|Trident\//, "Internet Explorer"],
];

const OS_PATTERNS: [RegExp, string][] = [
	[/Windows NT/, "Windows"],
	[/iPhone|iPad|iPod/, "iOS"],
	[/Mac OS X/, "macOS"],
	[/CrOS/, "ChromeOS"],
	[/Android/, "Android"],
	[/Linux/, "Linux"],
];

function firstMatch(userAgent: string, patterns: [RegExp, string][]): string {
	return patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Unknown";
}

function detectDeviceType(userAgent: string): ParsedUserAgent["deviceType"] {
	if (/iPad|Tablet|Nexus (?:7|9|10)|SM-T/.test(userAgent)) {
		return "tablet";
	}
	if (/Mobi|iPhone|iPod|Android.*Mobile/.test(userAgent)) {
		return "mobile";
	}
	return "desktop";
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
	const ua = userAgent ?? "";
	return {
		browser: firstMatch(ua, BROWSER_PATTERNS),
		os: firstMatch(ua, OS_PATTERNS),
		deviceType: detectDeviceType(ua),
	};
}

// Real browsers always send a User-Agent, so an empty one is a script.
const BOT_USER_AGENT = /bot\b|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|externalhit|facebookcatalog|embedly|scrapy|phantomjs|selenium|puppeteer|playwright|prerender|curl\/|wget\/|python-|axios\/|node-fetch|undici|go-http-client|java\/|okhttp|httpclient|libwww|^$/i;

export function isBotUserAgent(userAgent: string): boolean {
	return BOT_USER_AGENT.test(userAgent.trim());
}
