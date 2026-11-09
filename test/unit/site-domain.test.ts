import { describe, expect, it } from "vitest";
import { normalizeDomain, organizationFromDomain } from "#layers/core/shared/utils/domains";
import { siteDomainInputSchema } from "#layers/core/shared/schemas/sites";

describe("normalizeDomain", () => {
	it.each([
		"example.com",
		" Example.COM ",
		"www.example.com",
		"https://www.example.com/blog?ref=1",
		"http://example.com:8080",
		"example.com.",
		"example.com/#top",
	])("reads %s as example.com", (input) => {
		expect(normalizeDomain(input)).toBe("example.com");
	});

	it("keeps subdomains other than www", () => {
		expect(normalizeDomain("https://blog.example.com/post")).toBe("blog.example.com");
	});
});

describe("siteDomainInputSchema", () => {
	it("gives the normalised domain", () => {
		expect(siteDomainInputSchema.parse("https://www.Example.com/pricing")).toBe("example.com");
	});

	it.each(["", "   ", "example", "exa mple.com", "-example.com", "example.c", "https://", "a".repeat(250) + ".com"])("refuses %j", (input) => {
		expect(siteDomainInputSchema.safeParse(input).success).toBe(false);
	});

	it("accepts subdomains, long TLDs and international names", () => {
		for (const input of ["blog.example.co.uk", "shop.example.photography", "münchen.de", "xn--mnchen-3ya.de"]) {
			expect(siteDomainInputSchema.safeParse(input).success, input).toBe(true);
		}
	});

	it("explains a refusal in words a visitor understands", () => {
		const result = siteDomainInputSchema.safeParse("example");
		expect(result.error?.issues[0]?.message).toBe("Enter a domain like example.com");
	});
});

describe("organizationFromDomain", () => {
	it("names the Organization after the domain", () => {
		expect(organizationFromDomain("example.com")).toEqual({ name: "Example", slug: "example" });
	});

	it("uses the registrable name, not a subdomain or a country's second level", () => {
		expect(organizationFromDomain("blog.example.com")).toEqual({ name: "Example", slug: "example" });
		expect(organizationFromDomain("shop.acme.co.uk")).toEqual({ name: "Acme", slug: "acme" });
	});

	it("turns dashes into words", () => {
		expect(organizationFromDomain("my-coffee-shop.io")).toEqual({ name: "My Coffee Shop", slug: "my-coffee-shop" });
	});
});
