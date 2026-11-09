export default defineNuxtRouteMiddleware((to) => {
	const { email } = useDeployment();
	if (!email.value && to.meta.needsEmail) {
		return abortNavigation(createError({ statusCode: 404, statusMessage: "Page not found" }));
	}
});
