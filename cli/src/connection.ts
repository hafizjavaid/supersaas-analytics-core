export const DEFAULT_URL = "https://supersaasanalytics.com";

export interface SavedLogin {
	url: string;
	apiKey: string;
}

export type Env = Record<string, string | undefined>;

export type Connection
	= | { ok: true; url: string; apiKey: string }
		| { ok: false; error: string };

export function normalizeUrl(raw: string) {
	try {
		const url = new URL(raw.trim());
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url.href.replace(/\/+$/, "");
	}
	catch {
		return null;
	}
}

export function resolveUrl(flagUrl: string | undefined, env: Env, config?: SavedLogin) {
	const raw = flagUrl ?? env.SUPERSAAS_URL ?? config?.url ?? DEFAULT_URL;
	const url = normalizeUrl(raw);
	return url ? { ok: true as const, url } : { ok: false as const, error: `"${raw}" is not an http or https URL.` };
}

export function resolveConnection({ flagUrl, env, config }: { flagUrl?: string; env: Env; config?: SavedLogin }): Connection {
	const resolved = resolveUrl(flagUrl, env, config);
	if (!resolved.ok) {
		return resolved;
	}
	const { url } = resolved;
	// A saved key belongs to the server it was saved for and is never sent anywhere else.
	const apiKey = env.SUPERSAAS_API_KEY || (config?.url === url ? config.apiKey : undefined);
	if (!apiKey) {
		const login = url === DEFAULT_URL ? "supersaas login" : `supersaas login --url ${url}`;
		return { ok: false, error: `No API key for ${url}. Run \`${login}\` or set SUPERSAAS_API_KEY.` };
	}
	return { ok: true, url, apiKey };
}
