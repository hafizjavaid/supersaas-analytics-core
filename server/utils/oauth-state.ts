import { equalInConstantTime } from "./standard-webhooks";

const encoder = new TextEncoder();
const STATE_TTL_SEC = 10 * 60;

export interface OAuthStatePayload {
	siteId: string;
	userId: string;
}

async function signature(body: string, secret: string) {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`oauth-state.${body}`)));
	return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function encode(value: unknown) {
	return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(text: string): unknown {
	return JSON.parse(atob(text.replaceAll("-", "+").replaceAll("_", "/")));
}

// The OAuth round trip carries which Site to connect and who started it, signed so the callback can trust both.
export async function signOAuthState(payload: OAuthStatePayload, secret: string, nowMs = Date.now()): Promise<string> {
	const body = encode({ ...payload, exp: Math.floor(nowMs / 1000) + STATE_TTL_SEC, nonce: crypto.randomUUID() });
	return `${body}.${await signature(body, secret)}`;
}

export async function verifyOAuthState(state: string, secret: string, nowMs = Date.now()): Promise<OAuthStatePayload | null> {
	const [body, signed] = state.split(".");
	if (!body || !signed || !equalInConstantTime(signed, await signature(body, secret))) {
		return null;
	}
	try {
		const { siteId, userId, exp } = decode(body) as { siteId?: unknown; userId?: unknown; exp?: unknown };
		if (typeof siteId !== "string" || typeof userId !== "string" || typeof exp !== "number" || exp < nowMs / 1000) {
			return null;
		}
		return { siteId, userId };
	}
	catch {
		return null;
	}
}
