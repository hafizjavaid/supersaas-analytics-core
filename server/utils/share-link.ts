import type { H3Event } from "h3";
import { constantTimeEqual, verifyPassword } from "better-auth/crypto";
import { getShareLinkByToken } from "#layers/core/server/db/queries/share-links";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { hmacHex } from "#layers/core/server/utils/visitor-id";

const UNLOCK_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ShareLinkRow = NonNullable<Awaited<ReturnType<typeof getShareLinkByToken>>>;

function unlockCookieName(link: ShareLinkRow) {
	return `sd_share_${link.id}`;
}

// Keyed by the salted password hash, so only the server can mint it and it is bound to this one link.
function unlockGrant(linkId: string, passwordHash: string) {
	return hmacHex(passwordHash, `share-unlock:${linkId}`);
}

async function isUnlocked(event: H3Event, link: ShareLinkRow) {
	if (!link.passwordHash) {
		return true;
	}
	const presented = getCookie(event, unlockCookieName(link));
	return !!presented && constantTimeEqual(presented, await unlockGrant(link.id, link.passwordHash));
}

export async function requireShareLink(event: H3Event) {
	const link = await getShareLinkByToken(getRouterParam(event, "token") ?? "");
	if (!link) {
		throw createError({ statusCode: 404, statusMessage: "Share link not found" });
	}
	return link;
}

export async function readSharedDashboard(event: H3Event): Promise<SharedDashboard> {
	const link = await requireShareLink(event);
	if (!await isUnlocked(event, link)) {
		return { locked: true };
	}
	const { id, name, domain, timezone } = await requireSiteOfLink(link);
	return { locked: false, site: { id, name, domain, timezone }, outboundUrl: link.outboundUrl };
}

async function requireUnlockedLink(event: H3Event) {
	const link = await requireShareLink(event);
	if (!await isUnlocked(event, link)) {
		throw createError({ statusCode: 401, statusMessage: "This Share link needs its password" });
	}
	return link;
}

// A link that shares one Outbound link never opens the dashboard, and a dashboard link never opens link stats.
export async function requireSharedSiteAndRange(event: H3Event) {
	const link = await requireUnlockedLink(event);
	if (link.outboundUrl) {
		throw createError({ statusCode: 404, statusMessage: "Not found" });
	}
	return readRangeAndFilters(event, await requireSiteOfLink(link));
}

// Filters are left out, so a sponsor cannot probe the Site's other traffic through them.
export async function requireSharedOutboundLinkAndRange(event: H3Event) {
	const link = await requireUnlockedLink(event);
	if (!link.outboundUrl) {
		throw createError({ statusCode: 404, statusMessage: "Not found" });
	}
	const { site, range } = readRangeAndFilters(event, await requireSiteOfLink(link));
	return { site, range, filters: [], url: link.outboundUrl };
}

export async function unlockShareLink(event: H3Event, password: string) {
	const link = await requireShareLink(event);
	if (!link.passwordHash) {
		return;
	}
	if (!await verifyPassword({ hash: link.passwordHash, password })) {
		throw createError({ statusCode: 401, statusMessage: "Wrong password" });
	}
	setCookie(event, unlockCookieName(link), await unlockGrant(link.id, link.passwordHash), {
		httpOnly: true,
		sameSite: "lax",
		secure: getRequestProtocol(event, { xForwardedProto: true }) === "https",
		path: "/",
		maxAge: UNLOCK_MAX_AGE_SECONDS,
	});
}

async function requireSiteOfLink(link: ShareLinkRow) {
	const site = await getSiteById(link.siteId);
	if (!site) {
		throw createError({ statusCode: 404, statusMessage: "Share link not found" });
	}
	return site;
}
