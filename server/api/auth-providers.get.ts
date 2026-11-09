export default defineEventHandler(() => {
	const { auth } = useRuntimeConfig();
	return {
		google: Boolean(auth.googleClientId && auth.googleClientSecret),
		github: Boolean(auth.githubClientId && auth.githubClientSecret),
	};
});
