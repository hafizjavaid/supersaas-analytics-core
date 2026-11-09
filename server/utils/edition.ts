import type { H3Event } from "h3";
import type { BetterAuthPlugin } from "better-auth";
import type { AiAllowance } from "#layers/core/shared/utils/ai";
import type { DemoTraffic } from "#layers/core/server/utils/demo-traffic";
import type { EmailTemplateLoader, EmailTemplate } from "#layers/core/server/utils/email";
import type { SignUpPolicy } from "#layers/core/shared/types/deployment";
import { signUpPolicyOf } from "#layers/core/shared/utils/deployment";

export interface OrganizationRow extends OrganizationExtras {
	id: string;
}

// What the Hosted layer changes in core's server. Core's defaults are a Self-hosted copy's: always writable, no
// billing. The layer overrides fields from a Nitro plugin, which runs before the first request.
export interface ServerEdition {
	// Spread into the selects that join `organization` (Sites with their secret, memberships, Digest Sites, the admin
	// list), so each row carries `OrganizationExtras` without an extra query.
	organizationColumns: object;
	// Before a hit is stored, after bots and exclusions are dropped.
	admitHit: (site: OrganizationExtras) => boolean;
	// After a Pageview, Outbound link or Event is stored; never for identify calls or dropped hits.
	afterCountableHit: (site: { organizationId: string } & OrganizationExtras, origin: string, nowMs: number) => Promise<void>;
	ai: {
		// Before a question is answered; false answers 429.
		claimQuestion: (organization: OrganizationRow) => Promise<boolean>;
		allowance: (organization: OrganizationRow) => Promise<AiAllowance>;
	};
	// On every request checked against a permission the role has, reads included.
	assertCanChange: (event: H3Event, organization: OrganizationExtras, permission: OrganizationPermission) => void;
	// Before a Site is added, or its domain changed from `previousDomain`.
	assertDomainAvailable: (organization: OrganizationRow, domain: string, previousDomain?: string) => Promise<void>;
	afterOrganizationCreate: (organization: { id: string; createdAt: Date }, user: { email: string }) => Promise<void>;
	sendsDigests: (organization: OrganizationExtras) => boolean;
	// Dev only: after `seed:demo` replaced a Site's traffic.
	afterDemoSeed: (site: { organizationId: string }, traffic: DemoTraffic) => Promise<void>;
	emailTemplates: Partial<Record<EmailTemplate, EmailTemplateLoader>>;
	// How long a super-admin may view the app as a user. Null turns Impersonation off: its endpoints answer 404.
	impersonationSeconds: number | null;
	// Called when Better Auth is created, inside the first request, so they can read runtime config.
	authPlugins: () => BetterAuthPlugin[];
	// Whether anyone may sign up once someone has; when closed, only an email with a pending invite may.
	signUps: () => SignUpPolicy;
	// True sends email even without Resend or SMTP configured (it then goes to the console).
	assumesEmail: boolean;
}

const edition: ServerEdition = {
	organizationColumns: {},
	admitHit: () => true,
	afterCountableHit: async () => {},
	ai: {
		claimQuestion: async () => true,
		allowance: async () => ({ used: 0, limit: null, left: null }),
	},
	assertCanChange: () => {},
	assertDomainAvailable: async () => {},
	afterOrganizationCreate: async () => {},
	sendsDigests: () => true,
	afterDemoSeed: async () => {},
	emailTemplates: {},
	impersonationSeconds: null,
	authPlugins: () => [],
	// SIGNUPS is read as is, without the NUXT_ prefix, because the self-hosting guide names it so.
	signUps: () => signUpPolicyOf(process.env.SIGNUPS),
	assumesEmail: false,
};

export function serverEdition(): Readonly<ServerEdition> {
	return edition;
}

export function extendServerEdition(overrides: Partial<ServerEdition>) {
	Object.assign(edition, overrides);
}
