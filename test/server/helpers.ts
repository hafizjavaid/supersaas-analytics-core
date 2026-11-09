import { inject } from "vitest";
import { createClient } from "@libsql/client";
import { $fetch as anonymous$fetch, fetch as anonymousFetch, url } from "@nuxt/test-utils/e2e";
import type { Site, Summary } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import type { DeploymentOverrides } from "#layers/core/shared/types/deployment";
import type { AdminUser, AdminUserList } from "#layers/core/shared/types/admin";
import { newCredentials, signUpVerified } from "./accounts";
import type { Credentials } from "./accounts";

let siteCounter = 0;
let ipCounter = 0;

// Server tests arrange state the HTTP API cannot reach (past days, aged Visits) directly in the test database.
export const testDb = createClient({ url: "file:.data/test/db/sqlite.db" });

export interface TestUser extends Credentials {
	cookie: string;
	fetch: (path: string, init?: RequestInit) => Promise<Response>;
	$fetch: <T>(path: string, options?: FetchOptions) => Promise<T>;
}

type FetchOptions = NonNullable<Parameters<typeof anonymous$fetch>[1]>;

export function serverUrl() {
	return url("").replace(/\/$/, "");
}

export function asUser(credentials: Credentials, cookie: string): TestUser {
	const authHeaders = { cookie, origin: serverUrl() };
	return {
		...credentials,
		cookie,
		fetch: (path, init = {}) => anonymousFetch(path, { ...init, headers: { ...authHeaders, ...init.headers } }),
		$fetch: <T>(path: string, options: FetchOptions = {}) => anonymous$fetch<T>(path, { ...options, headers: { ...authHeaders, ...options.headers } } as FetchOptions) as Promise<T>,
	};
}

export async function signUp(label = "user") {
	const credentials = newCredentials(label);
	return asUser(credentials, await signUpVerified(serverUrl(), credentials));
}

let defaultUser: Promise<TestUser> | undefined;

// Most tests only need someone signed in, so each test file shares one user for `fetch` and `$fetch`.
export function signedIn() {
	defaultUser ??= signUp("owner");
	return defaultUser;
}

export async function fetch(path: string, init?: RequestInit) {
	return (await signedIn()).fetch(path, init);
}

export async function $fetch<T>(path: string, options?: FetchOptions) {
	return (await signedIn()).$fetch<T>(path, options);
}

export type SiteFields = Partial<Pick<Site, "name" | "domain" | "timezone">>;

let defaultOrganization: Promise<TestOrganization> | undefined;

export function signedInOrganization() {
	defaultOrganization ??= signedIn().then(createOrganization);
	return defaultOrganization;
}

export function sitesPath(organization: TestOrganization) {
	return `/api/organizations/${organization.id}/sites`;
}

export async function createSite(overrides: SiteFields = {}) {
	return createSiteAs(await signedIn(), await signedInOrganization(), overrides);
}

export function createSiteAs(user: TestUser, organization: TestOrganization, overrides: SiteFields = {}) {
	siteCounter += 1;
	const unique = `${Date.now()}-${siteCounter}`;
	return user.$fetch<Site>(sitesPath(organization), {
		method: "POST",
		body: { name: `Site ${unique}`, domain: `site-${unique}.example.com`, ...overrides },
	});
}

// A timezone whose local clock is far from midnight, so a test that moves rows back in time stays within today.
export function timezoneAwayFromMidnight() {
	const candidates = ["UTC", "Asia/Tokyo", "America/New_York", "Asia/Kolkata"];
	return candidates.find((timeZone) => {
		const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
		return hour >= 2 && hour <= 21;
	})!;
}

export function uniqueIp() {
	ipCounter += 1;
	return `198.51.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export interface Hit {
	ip?: string;
	userAgent?: string;
	headers?: Record<string, string>;
}

export function collect(body: unknown, { ip = "203.0.113.1", userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", headers = {} }: Hit = {}) {
	return anonymousFetch("/collect", {
		method: "POST",
		headers: { "content-type": "text/plain", "cf-connecting-ip": ip, "user-agent": userAgent, ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

export async function waitFor<T>(read: () => Promise<T>, isDone: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let value = await read();
	while (!isDone(value) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 100));
		value = await read();
	}
	return value;
}

export function getSummary(siteId: string, query = "range=today") {
	return $fetch<Summary & { range: ResolvedRange }>(`/api/sites/${siteId}/summary?${query}`);
}

export function waitForPageviews(siteId: string, pageviews: number, query = "range=today") {
	return waitFor(() => getSummary(siteId, query), summary => summary.pageviews >= pageviews);
}

export { anonymous$fetch, anonymousFetch };

export interface TestOrganization {
	id: string;
	name: string;
	slug: string;
}

let organizationCounter = 0;

export function createOrganization(owner: TestUser) {
	organizationCounter += 1;
	const slug = `org-${Date.now()}-${process.pid}-${organizationCounter}`;
	return owner.$fetch<TestOrganization>("/api/auth/organization/create", {
		method: "POST",
		body: { name: `Organization ${organizationCounter}`, slug },
	});
}

export function postAs(user: TestUser, path: string, body: unknown) {
	return user.fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function invite(inviter: TestUser, organizationId: string, email: string, role: string) {
	return postAs(inviter, "/api/auth/organization/invite-member", { organizationId, email, role });
}

export function acceptInvitation(invitee: TestUser, invitationId: string) {
	return postAs(invitee, "/api/auth/organization/accept-invitation", { invitationId });
}

export async function addMember(inviter: TestUser, organizationId: string, role: "admin" | "viewer") {
	const member = await signUp(role);
	const invitation = await (await invite(inviter, organizationId, member.email, role)).json() as { id: string };
	const accepted = await (await acceptInvitation(member, invitation.id)).json() as { member: { id: string } };
	return Object.assign(member, { memberId: accepted.member.id });
}

// Replaces every earlier override; `{}` restores the server's own settings. Plain fetch, so hooks outside a test can call it.
export function overrideDeployment(overrides: DeploymentOverrides) {
	return globalThis.fetch(`${inject("serverUrl")}/api/dev/deployment-overrides`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(overrides),
	});
}

export async function findUser(admin: TestUser, email: string): Promise<AdminUser> {
	const { users } = await admin.$fetch<AdminUserList>(`/api/admin/users?q=${encodeURIComponent(email)}`);
	return users.find(user => user.email === email)!;
}
