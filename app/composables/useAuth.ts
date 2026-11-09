import { createAuthClient } from "better-auth/client";
import { adminClient, lastLoginMethodClient, magicLinkClient, organizationClient } from "better-auth/client/plugins";

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	role?: string | null;
}

// Better Auth's admin plugin sets `impersonatedBy` on a session a super-admin started as this user.
export interface AuthSession {
	impersonatedBy?: string | null;
}

function makeAuthClient() {
	return createAuthClient({
		baseURL: window.location.origin,
		plugins: [
			organizationClient({ ac: organizationAccess, roles: organizationRoles }),
			adminClient(),
			magicLinkClient(),
			lastLoginMethodClient(),
		],
	});
}

let browserClient: ReturnType<typeof makeAuthClient> | undefined;

// Auth actions run in the browser only; SSR reads the session through `/api/auth/get-session` with the request's cookie.
export function authClient() {
	browserClient ??= makeAuthClient();
	return browserClient;
}

export function useAuth() {
	const requestFetch = useRequestFetch();
	const user = useState<AuthUser | null>("auth:user", () => null);
	const session = useState<AuthSession | null>("auth:session", () => null);
	const loaded = useState("auth:loaded", () => false);

	async function refreshSession() {
		const current = await requestFetch<{ user: AuthUser; session: AuthSession } | null>("/api/auth/get-session").catch(() => null);
		user.value = current?.user ?? null;
		session.value = current?.session ?? null;
		loaded.value = true;
		return user.value;
	}

	async function ensureSession() {
		return loaded.value ? user.value : refreshSession();
	}

	async function signOut() {
		await authClient().signOut();
		user.value = null;
		session.value = null;
		clearNuxtData();
		await navigateTo("/auth/login");
	}

	return {
		user: readonly(user),
		session: readonly(session),
		isLoggedIn: computed(() => !!user.value),
		isSuperAdmin: computed(() => isSuperAdmin(user.value)),
		refreshSession,
		ensureSession,
		signOut,
	};
}
