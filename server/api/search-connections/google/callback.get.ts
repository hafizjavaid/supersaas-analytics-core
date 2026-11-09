import { saveSearchCredential } from "#layers/core/server/db/queries/search";

// Google sends the browser back here. Any refusal returns to the Site settings with `?searchError=` for the page to show.
export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const state = typeof query.state === "string" ? await verifyOAuthState(query.state, oauthStateSecret()) : null;
	if (!state) {
		throw createError({ statusCode: 400, statusMessage: "This Search Console link has expired. Start connecting again." });
	}
	const { site, membership, user } = await requireSiteMembership(event, { integration: ["create"] }, state.siteId);
	if (user.id !== state.userId) {
		throw createError({ statusCode: 400, statusMessage: "This Search Console link was started by someone else." });
	}
	const settingsPath = `/app/${membership.slug}/sites/${site.id}/settings/integrations`;
	if (typeof query.code !== "string" || !query.code) {
		return sendRedirect(event, `${settingsPath}?searchError=denied`);
	}
	try {
		const refreshToken = await exchangeGoogleCode(query.code, googleRedirectUri(event));
		await saveSearchCredential(site.id, "google", await sealCredential(refreshToken));
	}
	catch (error) {
		console.error("[search-connections] Google code exchange failed", error);
		return sendRedirect(event, `${settingsPath}?searchError=google`);
	}
	return sendRedirect(event, `${settingsPath}?searchConnected=google`);
});
