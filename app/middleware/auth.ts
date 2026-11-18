export default defineNuxtRouteMiddleware(async (to) => {
	const { ensureSession } = useAuth();
	if (!await ensureSession() && !useEdition().demo.shows(to.path)) {
		return navigateTo({ path: "/auth/login", query: { redirect: to.fullPath } });
	}
});
