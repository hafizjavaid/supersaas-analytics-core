import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "hub:db";
import type { Digest, DigestNewSource, DigestReport, DigestSubscription } from "#layers/core/shared/types/digests";
import type { CountedLabel, DigestFrequency, DigestPeriod, DigestSetting } from "#layers/core/shared/utils/digests";
import { siteColumns } from "#layers/core/server/db/queries/sites";
import { tables } from "#layers/core/server/utils/database";
import { serverEdition } from "#layers/core/server/utils/edition";

const { dailyPages, dailySources, digests, digestSubscriptions, member, organization, sites, user } = tables;

const DIRECT = "(direct)";
const NEW_SOURCE_LIMIT = 5;
const DIGEST_LIST_LIMIT = 100;

export function listDigestSubscriptions(memberId: string, organizationId: string): Promise<DigestSubscription[]> {
	return db.select({
		siteId: sites.id,
		siteName: sites.name,
		siteDomain: sites.domain,
		frequency: sql<DigestSetting>`COALESCE(${digestSubscriptions.frequency}, 'off')`,
	})
		.from(sites)
		.leftJoin(digestSubscriptions, and(eq(digestSubscriptions.siteId, sites.id), eq(digestSubscriptions.memberId, memberId)))
		.where(eq(sites.organizationId, organizationId))
		.orderBy(asc(sites.name));
}

export async function saveDigestSubscription(memberId: string, siteId: string, setting: DigestSetting) {
	if (setting === "off") {
		await db.delete(digestSubscriptions).where(and(eq(digestSubscriptions.memberId, memberId), eq(digestSubscriptions.siteId, siteId)));
		return;
	}
	const updatedAt = Date.now();
	await db.insert(digestSubscriptions)
		.values({ memberId, siteId, frequency: setting, updatedAt })
		.onConflictDoUpdate({ target: [digestSubscriptions.memberId, digestSubscriptions.siteId], set: { frequency: setting, updatedAt } });
}

// The inner join on `member` drops a removed Member even where the database does not cascade.
export function listDigestRecipients(siteId: string) {
	return db.select({ memberId: member.id, email: user.email, frequency: digestSubscriptions.frequency })
		.from(digestSubscriptions)
		.innerJoin(member, eq(member.id, digestSubscriptions.memberId))
		.innerJoin(user, eq(user.id, member.userId))
		.innerJoin(sites, and(eq(sites.id, digestSubscriptions.siteId), eq(sites.organizationId, member.organizationId)))
		.where(eq(digestSubscriptions.siteId, siteId));
}

export async function listDigestSites() {
	const rows = await db.select({ ...siteColumns, organizationSlug: organization.slug, ...serverEdition().organizationColumns })
		.from(sites)
		.innerJoin(organization, eq(organization.id, sites.organizationId))
		.orderBy(asc(sites.name));
	return rows as (typeof rows[number] & OrganizationExtras)[];
}

export async function pageviewsByPath(siteId: string, { fromDate, toDate }: DigestPeriod): Promise<CountedLabel[]> {
	const rows = await db.select({ label: dailyPages.path, count: sql<number>`SUM(${dailyPages.pageviews})` })
		.from(dailyPages)
		.where(and(eq(dailyPages.siteId, siteId), gte(dailyPages.date, fromDate), lte(dailyPages.date, toDate)))
		.groupBy(dailyPages.path);
	return rows.map(row => ({ label: row.label, count: Number(row.count) }));
}

export async function visitsByReferrer(siteId: string, { fromDate, toDate }: DigestPeriod): Promise<CountedLabel[]> {
	const rows = await db.select({ label: dailySources.referrerDomain, count: sql<number>`SUM(${dailySources.visits})` })
		.from(dailySources)
		.where(and(eq(dailySources.siteId, siteId), gte(dailySources.date, fromDate), lte(dailySources.date, toDate)))
		.groupBy(dailySources.referrerDomain);
	return rows.map(row => ({ label: row.label === DIRECT ? "Direct" : row.label, count: Number(row.count) }));
}

// A referrer is new when its first Rollup day falls within the period.
export async function newReferrers(siteId: string, { fromDate, toDate }: DigestPeriod): Promise<DigestNewSource[]> {
	const firstDate = sql<string>`MIN(${dailySources.date})`;
	const visitsInPeriod = sql<number>`SUM(CASE WHEN ${dailySources.date} >= ${fromDate} THEN ${dailySources.visits} ELSE 0 END)`;
	const rows = await db.select({ label: dailySources.referrerDomain, visits: visitsInPeriod })
		.from(dailySources)
		.where(and(eq(dailySources.siteId, siteId), lte(dailySources.date, toDate), ne(dailySources.referrerDomain, DIRECT)))
		.groupBy(dailySources.referrerDomain)
		.having(gte(firstDate, fromDate))
		.orderBy(desc(visitsInPeriod), asc(dailySources.referrerDomain))
		.limit(NEW_SOURCE_LIMIT);
	return rows.map(row => ({ label: row.label, visits: Number(row.visits) }));
}

export async function digestExists(siteId: string, frequency: DigestFrequency, fromDate: string) {
	const row = await db.select({ id: digests.id })
		.from(digests)
		.where(and(eq(digests.siteId, siteId), eq(digests.frequency, frequency), eq(digests.fromDate, fromDate)))
		.get();
	return !!row;
}

// Undefined when another run stored this Digest first, so only one run emails it.
export function insertDigest(siteId: string, frequency: DigestFrequency, report: DigestReport, summary: string | null): Promise<Digest | undefined> {
	return db.insert(digests)
		.values({
			id: crypto.randomUUID(),
			siteId,
			frequency,
			fromDate: report.period.fromDate,
			toDate: report.period.toDate,
			summary,
			report,
			createdAt: Date.now(),
		})
		.onConflictDoNothing()
		.returning()
		.get();
}

export function listDigests(siteId: string): Promise<Digest[]> {
	return db.select()
		.from(digests)
		.where(eq(digests.siteId, siteId))
		.orderBy(desc(digests.toDate), asc(digests.frequency))
		.limit(DIGEST_LIST_LIMIT);
}
