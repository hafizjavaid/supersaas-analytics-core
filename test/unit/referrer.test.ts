import { describe, expect, it } from "vitest";
import { normalizeOutboundUrl, parseSource } from "#layers/core/server/utils/referrer";

describe("parseSource", () => {
	it("treats a missing referrer as direct", () => {
		expect(parseSource(null, "example.com")).toEqual({ referrerDomain: "(direct)", utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null });
	});

	it("keeps an external referrer's hostname without www", () => {
		expect(parseSource("https://www.Google.com/search?q=x", "example.com").referrerDomain).toBe("google.com");
	});

	it("accepts a bare hostname as sent by the Tracking snippet", () => {
		expect(parseSource("news.ycombinator.com", "example.com").referrerDomain).toBe("news.ycombinator.com");
	});

	it("treats a referrer from the Site itself as direct", () => {
		expect(parseSource("www.example.com", "example.com").referrerDomain).toBe("(direct)");
	});

	it("trims UTM values and drops blank ones", () => {
		expect(parseSource(null, "example.com", { utmSource: " newsletter ", utmMedium: "  ", utmCampaign: "launch", utmTerm: " web analytics ", utmContent: "" })).toMatchObject({
			utmSource: "newsletter",
			utmMedium: null,
			utmCampaign: "launch",
			utmTerm: "web analytics",
			utmContent: null,
		});
	});
});

describe("normalizeOutboundUrl", () => {
	it("drops the query string and hash", () => {
		expect(normalizeOutboundUrl("https://github.com/owner/repo?tab=readme#install", "example.com")).toBe("https://github.com/owner/repo");
	});

	it("ignores links to the Site's own domain, with or without www", () => {
		expect(normalizeOutboundUrl("https://www.example.com/pricing", "example.com")).toBeNull();
	});

	it("ignores non-http links", () => {
		expect(normalizeOutboundUrl("mailto:hi@example.org", "example.com")).toBeNull();
	});

	it("ignores unparseable links", () => {
		expect(normalizeOutboundUrl("not a url", "example.com")).toBeNull();
	});
});
