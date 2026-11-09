import { describe, expect, it } from "vitest";
import { slugify } from "#layers/core/shared/utils/slug";
import { organizationSlugSchema } from "#layers/core/shared/schemas/organizations";

describe("slugify", () => {
	it("lowercases and joins words with single dashes", () => {
		expect(slugify("  Acme & Sons, Inc.  ")).toBe("acme-sons-inc");
	});

	it("drops accents", () => {
		expect(slugify("Café Zürich")).toBe("cafe-zurich");
	});

	it("stays within 48 characters without a trailing dash", () => {
		const slug = slugify(`${"a".repeat(47)} b`);
		expect(slug.length).toBeLessThanOrEqual(48);
		expect(slug.endsWith("-")).toBe(false);
	});
});

describe("organizationSlugSchema", () => {
	it("rejects slugs that fixed app routes use", () => {
		expect(organizationSlugSchema.safeParse("onboard").success).toBe(false);
		expect(organizationSlugSchema.safeParse("admin").success).toBe(false);
	});

	it("accepts a plain slug", () => {
		expect(organizationSlugSchema.safeParse("acme-2").success).toBe(true);
	});
});
