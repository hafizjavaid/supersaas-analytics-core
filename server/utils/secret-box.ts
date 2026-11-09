const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION = "v1";

function toBase64Url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
	return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
}

async function keyOf(keyMaterial: string) {
	const base = await crypto.subtle.importKey("raw", encoder.encode(keyMaterial), "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		// The product's old name on purpose: changing it stops stored credentials decrypting.
		{ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: encoder.encode("supersaas-data secret box") },
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

// AES-GCM with a fresh IV, as `v1.<iv>.<ciphertext>`, for credentials kept at rest.
export async function encryptSecret(plaintext: string, keyMaterial: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(keyMaterial), encoder.encode(plaintext)));
	return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

export async function decryptSecret(sealed: string, keyMaterial: string): Promise<string> {
	const [version, iv, ciphertext] = sealed.split(".");
	if (version !== VERSION || !iv || !ciphertext) {
		throw new Error("Not a sealed secret");
	}
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, await keyOf(keyMaterial), fromBase64Url(ciphertext));
	return decoder.decode(plaintext);
}
