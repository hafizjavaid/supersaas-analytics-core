import { and, asc, eq, getTableColumns, inArray, ne } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { CreateSiteInput, UpdateSiteInput } from "#layers/core/shared/schemas/sites";
import { tables } from "#layers/core/server/utils/database";
import { serverEdition } from "#layers/core/server/utils/edition";
import { randomHex } from "#layers/core/server/utils/visitor-id";

const { secret: _secret, ...columnsWithoutSecret } = getTableColumns(tables.sites);

export const siteColumns = columnsWithoutSecret;

export function listAllSites() {
	return db.select(siteColumns).from(tables.sites).orderBy(asc(tables.sites.name));
}

export function listOrganizationSites(organizationId: string) {
	return db.select(siteColumns).from(tables.sites).where(eq(tables.sites.organizationId, organizationId)).orderBy(asc(tables.sites.name));
}

// A subquery rather than a list of ids, because D1 allows 100 bound parameters per statement.
export function inOrganization(siteId: AnySQLiteColumn, organizationId: string) {
	return inArray(siteId, db.select({ id: tables.sites.id }).from(tables.sites).where(eq(tables.sites.organizationId, organizationId)));
}

export function getSiteById(siteId: string) {
	return db.select(siteColumns).from(tables.sites).where(eq(tables.sites.id, siteId)).get();
}

export async function getSiteWithSecret(siteId: string) {
	const site = await db.select({ ...getTableColumns(tables.sites), ...serverEdition().organizationColumns })
		.from(tables.sites)
		.innerJoin(tables.organization, eq(tables.organization.id, tables.sites.organizationId))
		.where(eq(tables.sites.id, siteId))
		.get();
	return site as typeof site & OrganizationExtras | undefined;
}

export async function isDomainTaken(organizationId: string, domain: string, exceptSiteId?: string) {
	const existing = await db.select({ id: tables.sites.id })
		.from(tables.sites)
		.where(and(
			eq(tables.sites.organizationId, organizationId),
			eq(tables.sites.domain, domain),
			exceptSiteId ? ne(tables.sites.id, exceptSiteId) : undefined,
		))
		.get();
	return !!existing;
}

export function createSite(organizationId: string, input: CreateSiteInput) {
	return db.insert(tables.sites).values({
		id: crypto.randomUUID(),
		organizationId,
		name: input.name,
		domain: input.domain,
		timezone: input.timezone,
		secret: randomHex(32),
		createdAt: Math.floor(Date.now() / 1000),
	}).returning(siteColumns).get();
}

export function updateSite(siteId: string, input: UpdateSiteInput) {
	return db.update(tables.sites).set(input).where(eq(tables.sites.id, siteId)).returning(siteColumns).get();
}

const SITE_SCOPED_TABLES = [
	tables.payments,
	tables.events,
	tables.outboundLinks,
	tables.pages,
	tables.visits,
	tables.visitors,
	tables.sources,
	tables.dailySummary,
	tables.dailyPages,
	tables.dailySources,
	tables.dailyDevices,
	tables.dailyLocations,
	tables.dailyOutboundLinks,
	tables.dailyEvents,
	tables.searchDays,
	tables.searchRows,
	tables.digests,
] as const;

// Children before parents: the raw tables reference `sites`, `visitors` and `visits`.
// The shared `devices` and `locations` rows stay, as other Sites may use them.
function deleteAnalyticsQueries(siteIds: (column: AnySQLiteColumn) => SQL) {
	return SITE_SCOPED_TABLES.map(table => db.delete(table).where(siteIds(table.siteId)));
}

export function deleteSiteAnalyticsQueries(siteId: string) {
	return deleteAnalyticsQueries(column => eq(column, siteId));
}

export async function deleteSiteWithData(siteId: string) {
	const [first, ...rest] = deleteSiteAnalyticsQueries(siteId);
	await db.batch([
		first!,
		...rest,
		db.delete(tables.goals).where(eq(tables.goals.siteId, siteId)),
		db.delete(tables.funnels).where(eq(tables.funnels.siteId, siteId)),
		db.delete(tables.shareLinks).where(eq(tables.shareLinks.siteId, siteId)),
		db.delete(tables.revenueConnections).where(eq(tables.revenueConnections.siteId, siteId)),
		db.delete(tables.searchConnections).where(eq(tables.searchConnections.siteId, siteId)),
		db.delete(tables.digestSubscriptions).where(eq(tables.digestSubscriptions.siteId, siteId)),
		db.delete(tables.aiMessages).where(inArray(tables.aiMessages.conversationId, db.select({ id: tables.aiConversations.id }).from(tables.aiConversations).where(eq(tables.aiConversations.siteId, siteId)))),
		db.delete(tables.aiConversations).where(eq(tables.aiConversations.siteId, siteId)),
		db.delete(tables.sites).where(eq(tables.sites.id, siteId)),
	]);
}

// A subquery rather than a list of ids, because D1 allows 100 bound parameters per statement.
export async function deleteOrganizationSitesWithData(organizationId: string) {
	const organizationSiteIds = db.select({ id: tables.sites.id }).from(tables.sites).where(eq(tables.sites.organizationId, organizationId));
	const [first, ...rest] = deleteAnalyticsQueries(column => inArray(column, organizationSiteIds));
	await db.batch([
		first!,
		...rest,
		db.delete(tables.goals).where(inArray(tables.goals.siteId, organizationSiteIds)),
		db.delete(tables.funnels).where(inArray(tables.funnels.siteId, organizationSiteIds)),
		db.delete(tables.shareLinks).where(inArray(tables.shareLinks.siteId, organizationSiteIds)),
		db.delete(tables.revenueConnections).where(inArray(tables.revenueConnections.siteId, organizationSiteIds)),
		db.delete(tables.searchConnections).where(inArray(tables.searchConnections.siteId, organizationSiteIds)),
		db.delete(tables.digestSubscriptions).where(inArray(tables.digestSubscriptions.siteId, organizationSiteIds)),
		db.delete(tables.aiMessages).where(inArray(tables.aiMessages.conversationId, db.select({ id: tables.aiConversations.id }).from(tables.aiConversations).where(eq(tables.aiConversations.organizationId, organizationId)))),
		db.delete(tables.aiConversations).where(eq(tables.aiConversations.organizationId, organizationId)),
		db.delete(tables.sites).where(eq(tables.sites.organizationId, organizationId)),
	]);
}
