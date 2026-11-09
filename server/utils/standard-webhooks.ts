const TOLERANCE_SEC = 5 * 60;

const encoder = new TextEncoder();

export function equalInConstantTime(a: string, b: string) {
	if (a.length !== b.length) {
		return false;
	}
	let difference = 0;
	for (let index = 0; index < a.length; index++) {
		difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return difference === 0;
}

const BASE64 = /^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i;

// Polar signs with the secret's UTF-8 bytes if it was made before 8 September 2026, and the Standard Webhooks way
// (the base64 after an optional `whsec_`) since then, so both keys are tried.
function signingKeys(secret: string): Uint8Array<ArrayBuffer>[] {
	const keys = [encoder.encode(secret)];
	const encoded = secret.replace(/^whsec_/, "");
	if (encoded && BASE64.test(encoded)) {
		keys.push(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));
	}
	return keys;
}

async function sign(key: Uint8Array<ArrayBuffer>, content: string) {
	const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(content)));
	return btoa(String.fromCharCode(...digest));
}

// https://www.standardwebhooks.com
export async function verifyStandardWebhook(body: string, headers: Headers, secret: string, nowMs = Date.now()): Promise<boolean> {
	const id = headers.get("webhook-id");
	const timestamp = headers.get("webhook-timestamp");
	const signatures = headers.get("webhook-signature");
	if (!secret || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) {
		return false;
	}
	if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SEC) {
		return false;
	}
	const offered = signatures.split(" ").flatMap((entry) => {
		const [version, signature] = entry.split(",");
		return version === "v1" && signature ? [signature] : [];
	});
	for (const key of signingKeys(secret)) {
		const expected = await sign(key, `${id}.${timestamp}.${body}`);
		if (offered.some(signature => equalInConstantTime(signature, expected))) {
			return true;
		}
	}
	return false;
}
