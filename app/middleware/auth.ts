export default defineNuxtRouteMiddleware(async (to) => {
	const { ensureSession } = useAuth();
	if (!await ensureSession()) {
		return navigateTo({ path: "/auth/login", query: { redirect: to.fullPath } });
	}
});
