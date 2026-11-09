// Only same-site paths, so a crafted `?redirect=` cannot send someone to another origin after signing in.
export function safeRedirect(value: unknown, fallback = "/app") {
	return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
