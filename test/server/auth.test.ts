import { describe, expect, it, inject } from "vitest";

import { setupServer } from "./setup";
import { anonymousFetch, asUser, serverUrl, signUp } from "./helpers";
import { lastLoginMethodCookie, latestEmail, newCredentials, postJson, readOutbox, sessionCookie, signIn, signUpUnverified, verifyEmail } from "./accounts";

await setupServer();

interface SessionBody {
	user: { email: string; emailVerified: boolean; role: string | null };
}

describe("sign-up", () => {
	it("sends a verification email and refuses to sign in until the email is verified", async () => {
		const credentials = newCredentials();
		await signUpUnverified(serverUrl(), credentials);

		const email = await latestEmail(serverUrl(), credentials.email, "email-verification");
		expect(email.subject).toContain("Verify your email");
		expect(email.html).toContain(email.props.url.replaceAll("&", "&amp;"));

		const early = await postJson(serverUrl(), "/api/auth/sign-in/email", credentials);
		expect(early.status).toBe(403);
		expect((await early.json() as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");
	});

	it("signs the user in from the verification link", async () => {
		const credentials = newCredentials();
		await signUpUnverified(serverUrl(), credentials);

		const verified = await verifyEmail(serverUrl(), credentials.email);
		const user = asUser(credentials, sessionCookie(verified));

		const session = await user.$fetch<SessionBody>("/api/auth/get-session");
		expect(session.user).toMatchObject({ email: credentials.email, emailVerified: true });
	});

	it("answers a sign-up with a taken email like any other, without replacing the account", async () => {
		const user = await signUp();
		const response = await postJson(serverUrl(), "/api/auth/sign-up/email", { name: "Copy", email: user.email, password: "another-password" });
		expect(response.status).toBe(200);
		expect((await postJson(serverUrl(), "/api/auth/sign-in/email", { email: user.email, password: "another-password" })).status).toBe(401);
		expect(await signIn(serverUrl(), user)).toContain("session_token=");
	});

	it("emails the owner of a taken email a sign-in link instead of a verification link", async () => {
		const user = await signUp();
		await postJson(serverUrl(), "/api/auth/sign-up/email", { name: "Copy", email: user.email, password: "another-password" });

		const email = await latestEmail(serverUrl(), user.email, "account-exists");
		expect(email.subject).toMatch(/^You already have a .* account$/);
		expect(email.props.url).toMatch(/\/auth\/login$/);
	});

	it("sends a new verification link when an unverified email signs up again", async () => {
		const credentials = newCredentials();
		await signUpUnverified(serverUrl(), credentials);
		await latestEmail(serverUrl(), credentials.email, "email-verification");

		await signUpUnverified(serverUrl(), credentials);
		await expect.poll(async () => (await readOutbox(serverUrl(), credentials.email)).filter(sent => sent.template === "email-verification").length).toBe(2);
	});

	it("emails a magic link that signs the user in", async () => {
		const user = await signUp();
		expect((await postJson(serverUrl(), "/api/auth/sign-in/magic-link", { email: user.email })).status).toBe(200);

		const { props } = await latestEmail(serverUrl(), user.email, "magic-link");
		const signedIn = await fetch(props.url, { redirect: "manual" });
		const session = await asUser(user, sessionCookie(signedIn)).$fetch<SessionBody>("/api/auth/get-session");
		expect(session.user.email).toBe(user.email);
	});

	it("emails a password reset link", async () => {
		const user = await signUp();
		const response = await postJson(serverUrl(), "/api/auth/request-password-reset", { email: user.email, redirectTo: "/auth/reset-password" });
		expect(response.status).toBe(200);
		expect((await latestEmail(serverUrl(), user.email, "password-reset")).props.url).toContain("/reset-password/");
	});
});

describe("last login method", () => {
	it("remembers email after an email and password sign-in", async () => {
		const user = await signUp();
		const response = await postJson(serverUrl(), "/api/auth/sign-in/email", { email: user.email, password: user.password });
		expect(response.status).toBe(200);
		expect(lastLoginMethodCookie(response)).toBe("email");
	});

	it("remembers email after the sign-up verification link signs the user in", async () => {
		const credentials = newCredentials();
		await signUpUnverified(serverUrl(), credentials);
		expect(lastLoginMethodCookie(await verifyEmail(serverUrl(), credentials.email))).toBe("email");
	});

	it("remembers magic-link after a magic link sign-in", async () => {
		const user = await signUp();
		await postJson(serverUrl(), "/api/auth/sign-in/magic-link", { email: user.email });
		const { props } = await latestEmail(serverUrl(), user.email, "magic-link");
		expect(lastLoginMethodCookie(await fetch(props.url, { redirect: "manual" }))).toBe("magic-link");
	});

	it("remembers nothing after a failed sign-in", async () => {
		const user = await signUp();
		const response = await postJson(serverUrl(), "/api/auth/sign-in/email", { email: user.email, password: "wrong-password" });
		expect(lastLoginMethodCookie(response)).toBeUndefined();
	});
});

describe("super-admin", () => {
	it("makes the first sign-up a super-admin", async () => {
		const first = inject("firstUser");
		const session = await asUser(first, await signIn(serverUrl(), first)).$fetch<SessionBody>("/api/auth/get-session");
		expect(session.user.role).toBe("admin");
	});

	it("does not make later sign-ups super-admins", async () => {
		const session = await (await signUp()).$fetch<SessionBody>("/api/auth/get-session");
		expect(session.user.role).not.toBe("admin");
	});
});

describe("protected API", () => {
	it("answers 401 to the Sites API without a session", async () => {
		expect((await anonymousFetch("/api/organizations/any/sites")).status).toBe(401);
		expect((await anonymousFetch("/api/sites/any/summary")).status).toBe(401);
		expect((await anonymousFetch("/api/organizations")).status).toBe(401);
	});
});
