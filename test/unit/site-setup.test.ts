import { describe, expect, it } from "vitest";
import { domainOfOnboarding, onboardingPath, organizationForNewSite, siteWithDomain } from "#layers/core/app/utils/site-setup";

describe("onboardingPath", () => {
	it("carries the domain in the query", () => {
		expect(onboardingPath("example.com")).toBe("/app/onboard?domain=example.com");
	});
});

describe("domainOfOnboarding", () => {
	it("reads the domain back from an onboarding redirect", () => {
		expect(domainOfOnboarding(onboardingPath("example.com"))).toBe("example.com");
	});

	it("normalises it", () => {
		expect(domainOfOnboarding("/app/onboard?domain=https%3A%2F%2Fwww.Example.com%2F")).toBe("example.com");
	});

	it("has none for other redirects or a domain that would not make a Site", () => {
		expect(domainOfOnboarding("/app")).toBeNull();
		expect(domainOfOnboarding("/app/admin?domain=example.com")).toBeNull();
		expect(domainOfOnboarding("/app/onboard")).toBeNull();
		expect(domainOfOnboarding("/app/onboard?domain=nope")).toBeNull();
	});
});

describe("organizationForNewSite", () => {
	const organizations = [{ id: "a", slug: "a" }, { id: "b", slug: "b" }];

	it("picks the active Organization", () => {
		expect(organizationForNewSite(organizations, "b")).toEqual(organizations[1]);
	});

	it("falls back to the first when none is active or the active one is gone", () => {
		expect(organizationForNewSite(organizations, null)).toEqual(organizations[0]);
		expect(organizationForNewSite(organizations, "gone")).toEqual(organizations[0]);
	});

	it("has none without Organizations", () => {
		expect(organizationForNewSite([], "a")).toBeUndefined();
	});
});

describe("siteWithDomain", () => {
	it("finds a Site whose domain was saved in another shape", () => {
		const sites = [{ id: "1", domain: "blog.example.com" }, { id: "2", domain: "https://www.Example.com/" }];
		expect(siteWithDomain(sites, "example.com")?.id).toBe("2");
	});

	it("has none for a new domain", () => {
		expect(siteWithDomain([{ id: "1", domain: "blog.example.com" }], "example.com")).toBeUndefined();
	});
});
