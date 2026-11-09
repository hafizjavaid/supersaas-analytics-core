import { computeOrganizationSearch, listOrganizationSearchConnections } from "#layers/core/server/db/queries/search";
import { listOrganizationSites } from "#layers/core/server/db/queries/sites";
import type { SearchInsights } from "#layers/core/shared/types/search";

export default defineEventHandler(async (event): Promise<SearchInsights> => {
	const { membership } = await requireOrganizationMember(event);
	const query = getQuery(event);
	const range = isSearchRange(query.range) ? query.range : "28d";
	const [sites, connections, totals] = await Promise.all([
		listOrganizationSites(membership.id),
		listOrganizationSearchConnections(membership.id),
		computeOrganizationSearch(membership.id, range),
	]);
	return {
		range,
		sites: sites.map((site) => {
			const siteConnections = connections.filter(connection => connection.siteId === site.id && connection.property);
			const syncedAts = siteConnections.flatMap(connection => connection.syncedAt ?? []);
			const siteTotals = totals.get(site.id);
			return {
				site,
				engines: siteConnections.map(connection => connection.engine).sort(),
				lastSyncedAt: syncedAts.length > 0 ? Math.max(...syncedAts) : null,
				window: siteTotals?.window ?? null,
				summary: siteTotals?.summary ?? null,
				trend: siteTotals?.trend ?? [],
			};
		}),
	};
});
