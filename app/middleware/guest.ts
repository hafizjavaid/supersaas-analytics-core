export default defineNuxtRouteMiddleware(async (to) => {
	const { ensureSession } = useAuth();
	if (await ensureSession()) {
		return navigateTo(safeRedirect(to.query.redirect));
	}
});
