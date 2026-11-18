import { computeRangeSummary, computeVisitPoints } from "#layers/core/server/db/queries/overview";
import { getShareLinkByToken } from "#layers/core/server/db/queries/share-links";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { renderBadgeSvg, renderUnavailableBadgeSvg } from "#layers/core/server/utils/badge-image";
import type { BadgeOptions } from "#layers/core/shared/utils/badges";
import { resolveRange } from "#layers/core/shared/utils/dates";

export const BADGE_MAX_AGE_SECONDS = 60 * 60;
export const UNAVAILABLE_BADGE_MAX_AGE_SECONDS = 5 * 60;

export interface RenderedBadge {
	svg: string;
	maxAgeSeconds: number;
}

async function siteOfBadge(token: string) {
	const link = await getShareLinkByToken(token);
	if (!link?.badge || link.passwordHash || link.outboundUrl) {
		return undefined;
	}
	return getSiteById(link.siteId);
}

// The same 30-day Visitors as the Share link's dashboard: Rollups for past days, raw rows for today only.
export async function renderBadgeOfToken(token: string, options: BadgeOptions): Promise<RenderedBadge> {
	const site = await siteOfBadge(token);
	if (!site) {
		return { svg: renderUnavailableBadgeSvg(options), maxAgeSeconds: UNAVAILABLE_BADGE_MAX_AGE_SECONDS };
	}
	const now = Date.now();
	const range = resolveRange("30d", site.timezone);
	const [summary, points] = await Promise.all([
		computeRangeSummary(site, range, [], now),
		options.size === "wide" ? computeVisitPoints(site, range, [], now) : [],
	]);
	const svg = renderBadgeSvg({ ...options, domain: site.domain, visitors: summary.visitors, series: points.map(point => point.visitors) });
	return { svg, maxAgeSeconds: BADGE_MAX_AGE_SECONDS };
}
