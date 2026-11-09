import { describe, expect, it } from "vitest";
import { ipMatchesAnyRule, normalizeIpRule, normalizePathRule, pathMatchesAnyRule } from "#layers/core/shared/utils/traffic-exclusion";
import { isBotUserAgent } from "#layers/core/server/utils/user-agent";

describe("normalizeIpRule", () => {
	it.each([
		["203.0.113.7", "203.0.113.7"],
		[" 203.0.113.0/24 ", "203.0.113.0/24"],
		["2001:DB8::1", "2001:db8::1"],
		["2001:db8::/32", "2001:db8::/32"],
		["::ffff:203.0.113.7", "::ffff:203.0.113.7"],
	])("accepts %s", (rule, normalized) => {
		expect(normalizeIpRule(rule)).toBe(normalized);
	});

	it.each(["", "localhost", "203.0.113", "203.0.113.256", "203.0.113.0/33", "2001:db8::/129", "1:2:3:4:5:6:7:8:9", "1::2::3", "203.0.113.0/", "01.2.3.4"])("rejects %s", (rule) => {
		expect(normalizeIpRule(rule)).toBeNull();
	});
});

describe("ipMatchesAnyRule", () => {
	it("matches an exact IPv4 address", () => {
		expect(ipMatchesAnyRule("203.0.113.7", ["203.0.113.7"])).toBe(true);
		expect(ipMatchesAnyRule("203.0.113.8", ["203.0.113.7"])).toBe(false);
	});

	it("matches an address inside an IPv4 CIDR", () => {
		expect(ipMatchesAnyRule("203.0.113.200", ["203.0.113.0/24"])).toBe(true);
		expect(ipMatchesAnyRule("203.0.114.1", ["203.0.113.0/24"])).toBe(false);
		expect(ipMatchesAnyRule("8.8.8.8", ["0.0.0.0/0"])).toBe(true);
	});

	it("matches an IPv6 address and CIDR whatever the spelling", () => {
		expect(ipMatchesAnyRule("2001:0db8:0000:0000:0000:0000:0000:0001", ["2001:db8::1"])).toBe(true);
		expect(ipMatchesAnyRule("2001:db8:abcd::42", ["2001:db8::/32"])).toBe(true);
		expect(ipMatchesAnyRule("2001:db9::1", ["2001:db8::/32"])).toBe(false);
	});

	it("treats an IPv4-mapped IPv6 address as its IPv4 address", () => {
		expect(ipMatchesAnyRule("::ffff:203.0.113.7", ["203.0.113.0/24"])).toBe(true);
		expect(ipMatchesAnyRule("203.0.113.7", ["::ffff:203.0.113.7"])).toBe(true);
	});

	it("never matches an IPv4 address against an IPv6 rule", () => {
		expect(ipMatchesAnyRule("0.0.0.1", ["::1"])).toBe(false);
	});

	it("ignores an unparseable client IP or rule", () => {
		expect(ipMatchesAnyRule("not-an-ip", ["0.0.0.0/0"])).toBe(false);
		expect(ipMatchesAnyRule("203.0.113.7", ["garbage"])).toBe(false);
	});
});

describe("normalizePathRule", () => {
	it("accepts a path or glob starting with a slash", () => {
		expect(normalizePathRule(" /admin/* ")).toBe("/admin/*");
		expect(normalizePathRule("/")).toBe("/");
	});

	it.each(["", "admin/*", "*", "https://example.com/admin"])("rejects %s", (rule) => {
		expect(normalizePathRule(rule)).toBeNull();
	});
});

describe("pathMatchesAnyRule", () => {
	it("matches an exact path only", () => {
		expect(pathMatchesAnyRule("/pricing", ["/pricing"])).toBe(true);
		expect(pathMatchesAnyRule("/pricing/team", ["/pricing"])).toBe(false);
	});

	it("lets * match any characters, slashes included", () => {
		expect(pathMatchesAnyRule("/admin/users", ["/admin/*"])).toBe(true);
		expect(pathMatchesAnyRule("/admin/users/42/edit", ["/admin/*"])).toBe(true);
		expect(pathMatchesAnyRule("/blog/draft-post", ["/blog/draft-*"])).toBe(true);
		expect(pathMatchesAnyRule("/en/preview", ["/*/preview"])).toBe(true);
	});

	it("does not match the folder itself for a folder glob", () => {
		expect(pathMatchesAnyRule("/admin", ["/admin/*"])).toBe(false);
		expect(pathMatchesAnyRule("/administrator", ["/admin/*"])).toBe(false);
	});

	it("treats regular expression characters literally", () => {
		expect(pathMatchesAnyRule("/a.b", ["/a.b"])).toBe(true);
		expect(pathMatchesAnyRule("/axb", ["/a.b"])).toBe(false);
		expect(pathMatchesAnyRule("/c++", ["/c++"])).toBe(true);
	});
});

describe("isBotUserAgent", () => {
	it.each([
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
		"Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
		"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
		"curl/8.4.0",
		"python-requests/2.31.0",
		"Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
		"",
	])("detects %s", (userAgent) => {
		expect(isBotUserAgent(userAgent)).toBe(true);
	});

	it.each([
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0",
		"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
	])("lets a browser through: %s", (userAgent) => {
		expect(isBotUserAgent(userAgent)).toBe(false);
	});
});
