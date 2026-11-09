// Only Google connects through OAuth; Bing takes an API key.
export default defineEventHandler(async (event) => {
	const { site, user } = await requireSiteMembership(event, { integration: ["create"] });
	if (getRouterParam(event, "engine") !== "google" || !hasGoogleSearchConsole()) {
		throw createError({ statusCode: 404, statusMessage: "Search Console is not set up on this server" });
	}
	const state = await signOAuthState({ siteId: site.id, userId: user.id }, oauthStateSecret());
	return sendRedirect(event, googleAuthorizeUrl(state, googleRedirectUri(event)));
});
