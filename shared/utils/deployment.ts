import type { SignUpPolicy } from "../types/deployment";

export function signUpPolicyOf(value: string | undefined): SignUpPolicy {
	return value?.trim().toLowerCase() === "open" ? "open" : "closed";
}
