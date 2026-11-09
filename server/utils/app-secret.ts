// NUXT_AUTH_SECRET keys every HMAC and sealed credential the app makes; each use prefixes its own input.
export function appSecret() {
	return useRuntimeConfig().auth.secret || "supersaas-analytics-development";
}
