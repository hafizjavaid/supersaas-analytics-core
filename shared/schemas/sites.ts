import { z } from "zod";
import { MAX_EXCLUSION_RULES, normalizeIpRule, normalizePathRule } from "../utils/traffic-exclusion";
import { normalizeDomain } from "../utils/domains";

const siteName = z.string().trim().min(1).max(100);
const siteDomain = z.string().trim().min(1).max(253);
const hostname = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:\p{L}{2,63}|xn--[a-z0-9-]{1,59})$/u;

export const SITE_DOMAIN_HINT = "Enter a domain like example.com";

// The website's "Add my website" field: free text in, the domain Site creation then receives out.
export const siteDomainInputSchema = z.string()
	.transform(normalizeDomain)
	.pipe(siteDomain.regex(hostname, SITE_DOMAIN_HINT));

const exclusionRules = (normalize: (rule: string) => string | null, message: string) => z.array(z.string().max(500))
	.max(MAX_EXCLUSION_RULES, `Use at most ${MAX_EXCLUSION_RULES} rules`)
	.transform((rules, context) => {
		const normalized = rules.map(normalize);
		normalized.forEach((rule, index) => {
			if (rule === null) {
				context.addIssue({ code: "custom", message: `${message}: ${rules[index]}`, path: [index] });
			}
		});
		return [...new Set(normalized.filter(rule => rule !== null))];
	});
const siteTimezone = z.string().trim().max(64).transform(timezone => timezone || "UTC").refine(isKnownTimezone, "Unknown IANA timezone");

export const createSiteSchema = z.object({
	name: siteName,
	domain: siteDomain,
	timezone: siteTimezone.default("UTC"),
});

export const updateSiteSchema = z.object({
	name: siteName,
	domain: siteDomain,
	timezone: siteTimezone,
	excludedIps: exclusionRules(normalizeIpRule, "Enter an IP address or CIDR range"),
	excludedPaths: exclusionRules(normalizePathRule, "Start the path with /"),
}).partial().refine(input => Object.keys(input).length > 0, "Nothing to update");

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

function isKnownTimezone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	}
	catch {
		return false;
	}
}
