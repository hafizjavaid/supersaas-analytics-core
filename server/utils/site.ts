import type { H3Event } from "h3";
import { findMembership } from "#layers/core/server/db/queries/organizations";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { isRangeKey, resolveRange } from "#layers/core/shared/utils/dates";
import { parseFilters } from "#layers/core/shared/utils/filters";
import type { Site } from "#layers/core/shared/types/analytics";

// A Site in an Organization the user is not a Member of answers the same 404 as a missing one.
export async function requireSite(event: H3Event, permission?: OrganizationPermission) {
	return (await requireSiteMembership(event, permission)).site;
}

// `siteId` defaults to the route's `:id`.
export async function requireSiteMembership(event: H3Event, permission?: OrganizationPermission, siteId = getRouterParam(event, "id") ?? "") {
	const session = await requireUserSession(event);
	const site = await getSiteById(siteId);
	const membership = site && await findMembership(session.user.id, site.organizationId);
	if (!site || !membership) {
		throw createError({ statusCode: 404, statusMessage: "Site not found" });
	}
	if (permission && !roleCan(membership.role, permission)) {
		throw createError({ statusCode: 403, statusMessage: "Your role does not allow this" });
	}
	if (permission) {
		serverEdition().assertCanChange(event, membership, permission);
	}
	return { site, membership, user: session.user };
}

// `?range=` falls back to 30d, and `custom` needs `?from=` and `?to=` as YYYY-MM-DD in the Site's timezone; it ends at today at the latest.
// Filters come as repeated `?f=dimension:value`.
export async function requireSiteAndRange(event: H3Event) {
	return readRangeAndFilters(event, await requireSite(event));
}

export function readRangeAndFilters(event: H3Event, site: Site) {
	const query = getQuery(event);
	const rangeKey = isRangeKey(query.range) ? query.range : "30d";
	const range = resolveRange(rangeKey, site.timezone, query.from, query.to);
	return { site, range, filters: parseFilters(query.f) };
}

// An unknown `?view=` falls back to the first Dimension, as analytics-main did.
export function readDimension<TDimension extends string>(event: H3Event, dimensions: readonly TDimension[]): TDimension {
	const view = getQuery(event).view;
	return dimensions.find(dimension => dimension === view) ?? dimensions[0]!;
}

export function domainTakenError(domain: string) {
	return createError({ statusCode: 409, statusMessage: "Domain already exists", message: `A site for ${domain} already exists.` });
}
