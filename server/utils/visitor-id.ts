const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
	return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

// The salt rotates every UTC day (ADR 0002), so the same person is a new Visitor each day.
export async function computeVisitorId(salt: string, siteId: string, ip: string, userAgent: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${siteId}:${ip}:${userAgent}`));
	return toHex(new Uint8Array(digest).slice(0, 16));
}

export function hashIdentity(siteSecret: string, identifyId: string): Promise<string> {
	return hmacHex(siteSecret, identifyId);
}

export async function hmacHex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

export function randomHex(byteLength: number) {
	return toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}
