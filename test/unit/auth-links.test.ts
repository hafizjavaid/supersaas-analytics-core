import { describe, expect, it } from "vitest";
import { authPageLink, offersSignUp } from "#layers/core/app/utils/auth-links";

describe("authPageLink", () => {
	it("links to the page with the redirect, unless it is the app", () => {
		expect(authPageLink("/auth/login", "/app/acme")).toEqual({ path: "/auth/login", query: { redirect: "/app/acme" } });
		expect(authPageLink("/auth/sign-up", "/app")).toEqual({ path: "/auth/sign-up" });
	});
});

describe("offersSignUp", () => {
	it("offers sign-up while it is open", () => {
		expect(offersSignUp(true, "/app")).toBe(true);
	});

	it("hides sign-up while it is closed", () => {
		expect(offersSignUp(false, "/app")).toBe(false);
		expect(offersSignUp(false, "/app/onboard?domain=/auth/accept-invitation/abc")).toBe(false);
	});

	it("still offers sign-up on the way to an invitation", () => {
		expect(offersSignUp(false, "/auth/accept-invitation/abc")).toBe(true);
	});
});
