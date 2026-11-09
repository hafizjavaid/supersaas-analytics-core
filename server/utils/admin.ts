import type { H3Event } from "h3";

export function canUseAdminArea(user: { role?: string | null } | null | undefined) {
	return isSuperAdmin(user);
}

// Everyone else, signed out or not, gets the 404 of a page that does not exist.
export async function requireAdminSession(event: H3Event) {
	const session = await getUserSession(event);
	if (!session || !canUseAdminArea(session.user)) {
		throw createError({ statusCode: 404, statusMessage: "Page not found" });
	}
	return session;
}
