import { describe, expect, it } from "vitest";
import { outboundLinkHost, outboundLinkLabel } from "#layers/core/app/utils/outbound-links";

describe("outboundLinkLabel", () => {
	it("drops the scheme and a trailing slash", () => {
		expect(outboundLinkLabel("https://github.com/owner/repo")).toBe("github.com/owner/repo");
		expect(outboundLinkLabel("https://example.org/")).toBe("example.org");
		expect(outboundLinkLabel("http://example.org/docs/")).toBe("example.org/docs");
	});

	it("keeps a value it cannot parse", () => {
		expect(outboundLinkLabel("not a url")).toBe("not a url");
	});
});

describe("outboundLinkHost", () => {
	it("gives the host for the favicon", () => {
		expect(outboundLinkHost("https://docs.example.org/guide")).toBe("docs.example.org");
	});

	it("is empty for a value it cannot parse", () => {
		expect(outboundLinkHost("not a url")).toBe("");
	});
});
