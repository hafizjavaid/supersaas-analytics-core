export default defineNuxtRouteMiddleware(async (to) => {
	const { ensureSession } = useAuth();
	const user = await ensureSession();
	if (!user) {
		return navigateTo({ path: "/auth/login", query: { redirect: to.fullPath } });
	}
	if (!isSuperAdmin(user)) {
		return abortNavigation(createError({ statusCode: 404, statusMessage: "Page not found" }));
	}
});
