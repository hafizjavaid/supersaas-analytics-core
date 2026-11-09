import { describe, expect, it } from "vitest";
import { signUpPolicyOf } from "#layers/core/shared/utils/deployment";

describe("signUpPolicyOf", () => {
	it("reads open in any case", () => {
		expect(signUpPolicyOf("open")).toBe("open");
		expect(signUpPolicyOf(" Open ")).toBe("open");
	});

	it("falls back to closed when unset or unknown", () => {
		expect(signUpPolicyOf(undefined)).toBe("closed");
		expect(signUpPolicyOf("yes")).toBe("closed");
	});
});
