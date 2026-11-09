import { safeRedirect } from "#layers/core/shared/utils/redirect";

const DEFAULT_REDIRECT = safeRedirect(undefined);

export function authPageLink(path: string, redirect: string) {
	return redirect === DEFAULT_REDIRECT ? { path } : { path, query: { redirect } };
}

// A closed sign-up still lets an invited person create the account the invitation is for.
export function offersSignUp(signUpOpen: boolean, redirect: string) {
	return signUpOpen || redirect.startsWith("/auth/accept-invitation/");
}
