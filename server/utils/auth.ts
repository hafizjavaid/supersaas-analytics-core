import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod, magicLink, organization } from "better-auth/plugins";
import { db } from "hub:db";
import type { H3Event } from "h3";
import * as authSchema from "#layers/core/server/db/schema/auth";
import { findMember } from "#layers/core/server/db/queries/organizations";
import { deleteOrganizationSitesWithData } from "#layers/core/server/db/queries/sites";
import { organizationSlugSchema } from "#layers/core/shared/schemas/organizations";

const MAGIC_LINK_EXPIRES_IN = 60 * 10;

const EMAIL_ONLY_AUTH_PATHS = ["/sign-in/magic-link", "/request-password-reset", "/send-verification-email"];

// Better Auth's admin plugin serves these; the edition turns them on.
const IMPERSONATION_AUTH_PATHS = ["/admin/impersonate-user", "/admin/stop-impersonating"];

function originOf(request: Request | undefined, configuredUrl: string) {
	if (configuredUrl) {
		return configuredUrl.replace(/\/$/, "");
	}
	return request ? new URL(request.url).origin : "";
}

// Without email the inviter shares the accept link themselves.
function withInvitationUrl(returned: unknown, request: Request | undefined, configuredUrl: string) {
	const invitation = returned && !isAPIError(returned) ? returned as { id?: string } : undefined;
	return invitation?.id ? { ...invitation, url: `${originOf(request, configuredUrl)}${acceptInvitationPath(invitation.id)}` } : undefined;
}

function socialProvider(clientId: string, clientSecret: string) {
	// Accounts are created by email only; Google and GitHub sign in to an existing account with the same email.
	return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

function rejectOwnerRole(role: string) {
	if (!isInvitableRole(role)) {
		throw new APIError("FORBIDDEN", { message: "An Organization has exactly one Owner. Transfer ownership instead." });
	}
}

function requireValidSlug(slug: string | undefined) {
	const parsed = organizationSlugSchema.safeParse(slug);
	if (slug !== undefined && !parsed.success) {
		throw new APIError("BAD_REQUEST", { message: parsed.error.issues[0]?.message ?? "Invalid URL" });
	}
}

// Better Auth's admin endpoints answer 403; like the rest of the admin area, they 404 instead. Stopping an
// impersonation is the impersonated user's own action, so it's left to the edition that turns Impersonation on.
async function guardAdminActions(path: string, current: { user: { role?: string | null } } | null) {
	if (IMPERSONATION_AUTH_PATHS.includes(path) && serverEdition().impersonationSeconds === null) {
		throw new APIError("NOT_FOUND", { message: "Not found" });
	}
	if (path !== "/admin/stop-impersonating" && !canUseAdminArea(current?.user)) {
		throw new APIError("NOT_FOUND", { message: "Not found" });
	}
}

function createAuth() {
	const config = useRuntimeConfig();
	const { appName } = config.public;
	const google = socialProvider(config.auth.googleClientId, config.auth.googleClientSecret);
	const github = socialProvider(config.auth.githubClientId, config.auth.githubClientSecret);

	return betterAuth({
		appName,
		baseURL: config.auth.url || undefined,
		secret: config.auth.secret || undefined,
		database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			resetPasswordTokenExpiresIn: 60 * 30,
			revokeSessionsOnPasswordReset: true,
			// Sign-up answers a taken email like a new one (no account enumeration), so the owner hears about it by email.
			onExistingUserSignUp: async ({ user }, request) => {
				if (!hasEmail()) {
					return;
				}
				if (!user.emailVerified) {
					await serverAuth().api.sendVerificationEmail({ body: { email: user.email } });
					return;
				}
				await sendEmail({
					to: user.email,
					subject: `You already have a ${appName} account`,
					template: "account-exists",
					props: { url: `${originOf(request, config.auth.url)}/auth/login` },
				});
			},
			sendResetPassword: ({ user, url }) => sendEmail({
				to: user.email,
				subject: "Reset your password",
				template: "password-reset",
				props: { url },
			}),
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: 60 * 60,
			sendVerificationEmail: ({ user, url }) => sendEmail({
				to: user.email,
				subject: `Verify your email for ${appName}`,
				template: "email-verification",
				props: { url },
			}),
		},
		socialProviders: {
			...(google && { google }),
			...(github && { github }),
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google", "github"],
			},
		},
		advanced: {
			useSecureCookies: !import.meta.dev,
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user, ctx) => {
						if (!ctx?.context.adapter) {
							return { data: user };
						}
						// Every way in (email, magic link, OAuth) creates the user here, so closed sign-up is enforced once.
						await requireSignUpAllowed(user.email);
						const userCount = await ctx.context.adapter.count({ model: "user" });
						// No verification email can arrive, so the address is taken on trust.
						const verified = hasEmail() ? user : { ...user, emailVerified: true };
						return { data: userCount === 0 ? { ...verified, role: "admin" } : verified };
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (EMAIL_ONLY_AUTH_PATHS.includes(ctx.path) && !hasEmail()) {
					throw new APIError("NOT_FOUND", { message: "Not found" });
				}
				if (ctx.path.startsWith("/admin/")) {
					await guardAdminActions(ctx.path, await getSessionFromCtx(ctx));
				}
				// Better Auth answers an Admin removing the Owner with a misleading "only owner" message, so check it first.
				if (ctx.path !== "/organization/remove-member") {
					return;
				}
				const { organizationId, memberIdOrEmail } = (ctx.body ?? {}) as { organizationId?: string; memberIdOrEmail?: string };
				const target = organizationId && memberIdOrEmail ? await findMember(organizationId, memberIdOrEmail) : undefined;
				if (target?.role === "owner") {
					throw new APIError("FORBIDDEN", { message: "The Owner cannot be removed. Transfer ownership first." });
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/organization/invite-member" && !hasEmail()) {
					const invitation = withInvitationUrl(ctx.context.returned, ctx.request, config.auth.url);
					return invitation && ctx.json(invitation);
				}
			}),
		},
		plugins: [
			admin({ impersonationSessionDuration: serverEdition().impersonationSeconds ?? undefined }),
			// Cookie only: the badge is per browser, and storing it would add a user write to every sign-in.
			// The sign-up verification link signs in too, so it counts as email.
			lastLoginMethod({ customResolveMethod: ctx => (ctx.path === "/verify-email" ? "email" : null) }),
			magicLink({
				expiresIn: MAGIC_LINK_EXPIRES_IN,
				sendMagicLink: ({ email, url }) => sendEmail({
					to: email,
					subject: `Sign in to ${appName}`,
					template: "magic-link",
					props: { url, expiresInMinutes: MAGIC_LINK_EXPIRES_IN / 60 },
				}),
			}),
			organization({
				ac: organizationAccess,
				roles: organizationRoles,
				creatorRole: "owner",
				// Members are unlimited; Better Auth would otherwise cap Members and pending invites at 100.
				membershipLimit: Number.POSITIVE_INFINITY,
				invitationLimit: Number.POSITIVE_INFINITY,
				requireEmailVerificationOnInvitation: true,
				sendInvitationEmail: async ({ id, email, role, organization, inviter }, request) => {
					await sendEmail({
						to: email,
						subject: `Join ${organization.name} on ${appName}`,
						template: "member-invite",
						props: {
							url: `${originOf(request, config.auth.url)}${acceptInvitationPath(id)}`,
							inviterName: inviter.user.name,
							organizationName: organization.name,
							role,
						},
					});
				},
				organizationHooks: {
					beforeCreateOrganization: async ({ organization }) => {
						requireValidSlug(organization.slug);
					},
					afterCreateOrganization: ({ organization, user }) => serverEdition().afterOrganizationCreate(organization, user),
					beforeUpdateOrganization: async ({ organization }) => {
						requireValidSlug(organization.slug);
					},
					beforeDeleteOrganization: async ({ organization }) => {
						await deleteOrganizationSitesWithData(organization.id);
					},
					beforeCreateInvitation: async ({ invitation }) => {
						rejectOwnerRole(invitation.role);
					},
					beforeUpdateMemberRole: async ({ newRole }) => {
						rejectOwnerRole(newRole);
					},
				},
			}),
			...serverEdition().authPlugins(),
		],
	});
}

let auth: ReturnType<typeof createAuth> | undefined;

// Created on first use, inside a request, so runtime config reads the Worker's env bindings.
export function serverAuth() {
	auth ??= createAuth();
	return auth;
}

export async function getUserSession(event: H3Event) {
	return serverAuth().api.getSession({ headers: event.headers });
}

export async function requireUserSession(event: H3Event) {
	const session = await getUserSession(event);
	if (!session) {
		throw createError({ statusCode: 401, statusMessage: "Sign in to continue" });
	}
	return session;
}
