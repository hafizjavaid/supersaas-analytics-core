import { describe, expect, it } from "vitest";
import { parseUserAgent } from "#layers/core/server/utils/user-agent";

const UA = {
	chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
	edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
	safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
	safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
	safariIpad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
	chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
	samsungTablet: "Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36",
	operaWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0",
	chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
	ie11: "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko",
};

describe("parseUserAgent", () => {
	it.each([
		["chromeWindows", { browser: "Chrome", os: "Windows", deviceType: "desktop" }],
		["edgeWindows", { browser: "Edge", os: "Windows", deviceType: "desktop" }],
		["operaWindows", { browser: "Opera", os: "Windows", deviceType: "desktop" }],
		["safariMac", { browser: "Safari", os: "macOS", deviceType: "desktop" }],
		["firefoxLinux", { browser: "Firefox", os: "Linux", deviceType: "desktop" }],
		["chromeAndroid", { browser: "Chrome", os: "Android", deviceType: "mobile" }],
		["samsungTablet", { browser: "Samsung Internet", os: "Android", deviceType: "tablet" }],
		["chromebook", { browser: "Chrome", os: "ChromeOS", deviceType: "desktop" }],
		["ie11", { browser: "Internet Explorer", os: "Windows", deviceType: "desktop" }],
	] as const)("parses %s", (name, expected) => {
		expect(parseUserAgent(UA[name])).toEqual(expected);
	});

	it("records iPhones as iOS even though their user agent says \"like Mac OS X\"", () => {
		expect(parseUserAgent(UA.safariIphone)).toEqual({ browser: "Safari", os: "iOS", deviceType: "mobile" });
	});

	it("records Chrome on iOS as Chrome", () => {
		expect(parseUserAgent(UA.chromeIphone)).toEqual({ browser: "Chrome", os: "iOS", deviceType: "mobile" });
	});

	it("records iPads as iOS tablets", () => {
		expect(parseUserAgent(UA.safariIpad)).toEqual({ browser: "Safari", os: "iOS", deviceType: "tablet" });
	});

	it("falls back to Unknown on a desktop for an empty user agent", () => {
		expect(parseUserAgent(null)).toEqual({ browser: "Unknown", os: "Unknown", deviceType: "desktop" });
	});
});
