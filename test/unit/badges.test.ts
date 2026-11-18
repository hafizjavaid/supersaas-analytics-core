import { describe, expect, it } from "vitest";
import { badgeSnippet, shareLinkChangeRefusal } from "#layers/core/shared/utils/badges";

const dashboardLink = { hasPassword: false, outboundUrl: null, badge: false };

describe("badgeSnippet", () => {
	it("links the small auto Badge to the Share link, nofollow, with its size and an alt naming the domain", () => {
		expect(badgeSnippet({ origin: "https://supersaasanalytics.com", token: "abc123", domain: "example.com", theme: "auto", size: "small" })).toBe(
			`<a href="https://supersaasanalytics.com/share/abc123?ref=badge" target="_blank" rel="noopener nofollow">
  <img src="https://supersaasanalytics.com/badge/abc123.svg?theme=auto&size=small"
       alt="example.com traffic, verified by Supersaas Analytics" width="200" height="48"/>
</a>`,
		);
	});

	it("sizes the wide dark Badge wider", () => {
		const snippet = badgeSnippet({ origin: "https://stats.example.org", token: "t", domain: "shop.example.org", theme: "dark", size: "wide" });
		expect(snippet).toContain(`src="https://stats.example.org/badge/t.svg?theme=dark&size=wide"`);
		expect(snippet).toContain(`width="320" height="48"`);
	});

	it("escapes a domain that would break out of the alt attribute", () => {
		const snippet = badgeSnippet({ origin: "https://a.b", token: "t", domain: `x"><script>`, theme: "light", size: "small" });
		expect(snippet).toContain(`alt="x&quot;&gt;&lt;script&gt; traffic`);
	});
});

describe("shareLinkChangeRefusal", () => {
	it("allows a Badge on a dashboard link without a password", () => {
		expect(shareLinkChangeRefusal(dashboardLink, { badge: true })).toBeUndefined();
	});

	it("refuses a Badge on a link with a password or an Outbound link", () => {
		expect(shareLinkChangeRefusal({ ...dashboardLink, hasPassword: true }, { badge: true })).toMatch(/password/);
		expect(shareLinkChangeRefusal({ ...dashboardLink, outboundUrl: "https://x.example/" }, { badge: true })).toMatch(/Outbound link/);
	});

	it("refuses a password while the Badge is on, but not with the Badge turned off in the same change", () => {
		expect(shareLinkChangeRefusal({ ...dashboardLink, badge: true }, { password: "s3cret-pass" })).toMatch(/Badge/);
		expect(shareLinkChangeRefusal({ ...dashboardLink, badge: true }, { badge: false, password: "s3cret-pass" })).toBeUndefined();
	});
});
