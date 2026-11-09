export interface Credentials {
	name: string;
	email: string;
	password: string;
}

export interface SentEmail {
	to: string;
	subject: string;
	template: string;
	props: { url: string } & Record<string, unknown>;
	html: string;
}

let accountCounter = 0;

export function newCredentials(label = "user"): Credentials {
	accountCounter += 1;
	const unique = `${Date.now()}-${process.pid}-${accountCounter}`;
	return { name: `Test ${label} ${accountCounter}`, email: `${label}-${unique}@example.com`, password: "correct-horse-battery" };
}

export async function readOutbox(baseUrl: string, email: string) {
	const response = await fetch(`${baseUrl}/api/dev/emails?to=${encodeURIComponent(email)}`);
	return await response.json() as SentEmail[];
}

export async function latestEmail(baseUrl: string, email: string, template: string) {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const found = (await readOutbox(baseUrl, email)).findLast(sent => sent.template === template);
		if (found) {
			return found;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`No ${template} email reached ${email}`);
}

export function sessionCookie(response: Response) {
	const cookies = response.headers.getSetCookie().map(cookie => cookie.split(";")[0]!);
	const session = cookies.filter(cookie => cookie.includes("session_token="));
	if (!session.length) {
		throw new Error(`Expected a session cookie, got status ${response.status}`);
	}
	return session.join("; ");
}

export function lastLoginMethodCookie(response: Response) {
	const cookie = response.headers.getSetCookie().find(cookie => cookie.startsWith("better-auth.last_used_login_method="));
	return cookie?.split(";")[0]!.split("=")[1];
}

export function postJson(baseUrl: string, path: string, body: unknown, cookie?: string) {
	return fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "origin": baseUrl, ...(cookie && { cookie }) },
		body: JSON.stringify(body),
	});
}

export async function signUpUnverified(baseUrl: string, credentials: Credentials) {
	const response = await postJson(baseUrl, "/api/auth/sign-up/email", credentials);
	if (!response.ok) {
		throw new Error(`Sign-up failed with ${response.status}: ${await response.text()}`);
	}
}

export async function verifyEmail(baseUrl: string, email: string) {
	const { props } = await latestEmail(baseUrl, email, "email-verification");
	return fetch(props.url, { redirect: "manual" });
}

export async function signIn(baseUrl: string, { email, password }: Credentials) {
	const response = await postJson(baseUrl, "/api/auth/sign-in/email", { email, password });
	return sessionCookie(response);
}

export async function signUpVerified(baseUrl: string, credentials: Credentials) {
	await signUpUnverified(baseUrl, credentials);
	await verifyEmail(baseUrl, credentials.email);
	return signIn(baseUrl, credentials);
}
