import { APIError } from "better-auth/api";
import { hasAnyUser, hasPendingInvitation } from "#layers/core/server/db/queries/sign-up";

// A Self-hosted copy is on the open internet: after the first sign-up (the Super-admin), people join by invite only.
export async function isSignUpOpen() {
	return signUpPolicy() === "open" || !await hasAnyUser();
}

export async function requireSignUpAllowed(email: string) {
	if (await isSignUpOpen() || await hasPendingInvitation(email)) {
		return;
	}
	// FORBIDDEN makes Better Auth answer an email sign-up as it answers a taken email, so it reveals no accounts.
	throw new APIError("FORBIDDEN", { message: "Sign-up is closed. Ask an Organization Owner or Admin to invite you." });
}
