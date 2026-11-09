import { siteDomainInputSchema } from "#layers/core/shared/schemas/sites";
import { normalizeDomain } from "#layers/core/shared/utils/domains";

const ONBOARDING_PATH = "/app/onboard";

export function onboardingPath(domain: string) {
	return `${ONBOARDING_PATH}?${new URLSearchParams({ domain })}`;
}

export function parseSiteDomain(value: unknown) {
	const parsed = siteDomainInputSchema.safeParse(typeof value === "string" ? value : "");
	return parsed.success ? parsed.data : null;
}

export function domainOfOnboarding(redirect: string) {
	const url = new URL(redirect, "http://local");
	return url.pathname === ONBOARDING_PATH ? parseSiteDomain(url.searchParams.get("domain")) : null;
}

export function organizationForNewSite<T extends { id: string }>(organizations: T[], activeOrganizationId: string | null | undefined) {
	return organizations.find(organization => organization.id === activeOrganizationId) ?? organizations[0];
}

export function siteWithDomain<T extends { domain: string }>(sites: T[], domain: string) {
	return sites.find(site => normalizeDomain(site.domain) === domain);
}
