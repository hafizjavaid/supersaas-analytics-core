import { and, asc, count, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias, QueryBuilder } from "drizzle-orm/sqlite-core";
import { db } from "hub:db";
import type { Site, VisitorPlace, VisitorSource } from "#layers/core/shared/types/analytics";
import type { ConversionsSummary, PaymentRow, RevenueBreakdownRow, RevenuePoint } from "#layers/core/shared/types/revenue";
import type { RangeQueryPlan, RawWindow, ResolvedRange } from "#layers/core/shared/utils/dates";
import { dateRangeList, daySegments, planHourlyWindow, planPreviousRangeQuery, planRangeQuery, rawWindowOfPlan, startOfDayUtcMs } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import type { RevenueEnvironment, RevenueProviderId } from "#layers/core/shared/utils/revenue";
import { byMatchingVisitor, dayIndex, inValues } from "#layers/core/server/db/queries/filters";
import { inOrganization } from "#layers/core/server/db/queries/sites";
import { tables } from "#layers/core/server/utils/database";
import type { ProviderPayment } from "#layers/core/server/utils/revenue";

const { locations, pages, payments, revenueConnections, sources, visitors, visits } = tables;

const ROW_LIMIT = 100;

// Must match the casing NuxtHub gives `db`, or subqueries name columns in camelCase.
const subquery = new QueryBuilder({ casing: "snake_case" });
const payerVisits = alias(visits, "payer_visits");
const samePerson = alias(visitors, "same_person");
const payer = alias(visitors, "payer");

export type RevenueConnectionRow = typeof revenueConnections.$inferSelect;

export interface RevenueConnectionInput {
	provider: RevenueProviderId;
	environment: RevenueEnvironment;
	accessToken: string;
	currency: string;
}

export function getRevenueConnection(siteId: string): Promise<RevenueConnectionRow | undefined> {
	return db.select().from(revenueConnections).where(eq(revenueConnections.siteId, siteId)).get();
}

export function getRevenueConnectionById(id: string): Promise<RevenueConnectionRow | undefined> {
	return db.select().from(revenueConnections).where(eq(revenueConnections.id, id)).get();
}

// Reconnecting keeps the id, so the webhook already set up at the provider keeps working, and the secret too unless
// the provider changes. `webhookSecret` is empty until pasted in for a provider that generates its own, and is dropped
// when such a provider's environment changes, because its test and live endpoints have different secrets.
export function saveRevenueConnection(siteId: string, input: RevenueConnectionInput, webhookSecret: string): Promise<RevenueConnectionRow> {
	const keepsSecret = sql`${revenueConnections.provider} = excluded.provider AND (${revenueConnections.environment} = excluded.environment OR excluded.webhook_secret <> '')`;
	return db.insert(revenueConnections).values({
		id: crypto.randomUUID(),
		siteId,
		...input,
		webhookSecret,
		createdAt: Math.floor(Date.now() / 1000),
	}).onConflictDoUpdate({
		target: revenueConnections.siteId,
		set: {
			...input,
			webhookSecret: sql`CASE WHEN ${keepsSecret} THEN ${revenueConnections.webhookSecret} ELSE excluded.webhook_secret END`,
		},
	}).returning().get();
}

export function saveWebhookSecret(siteId: string, webhookSecret: string): Promise<RevenueConnectionRow | undefined> {
	return db.update(revenueConnections).set({ webhookSecret }).where(eq(revenueConnections.siteId, siteId)).returning().get();
}

export async function deleteRevenueConnection(siteId: string) {
	await db.delete(revenueConnections).where(eq(revenueConnections.siteId, siteId));
}

export async function lastPaymentAt(siteId: string): Promise<number | null> {
	const row = await db.select({ paidAt: sql<number | null>`MAX(${payments.paidAt})` }).from(payments).where(eq(payments.siteId, siteId)).get();
	return row?.paidAt ?? null;
}

// A Visitor id from another Site, or one never stored, is dropped: a checkout can carry any metadata.
export async function recordPayment(connection: RevenueConnectionRow, payment: ProviderPayment) {
	const visitor = await db.select({ id: visitors.id }).from(visitors)
		.where(and(eq(visitors.id, payment.visitorId), eq(visitors.siteId, connection.siteId)))
		.get();
	if (!visitor) {
		return false;
	}
	await db.insert(payments)
		.values({ id: crypto.randomUUID(), siteId: connection.siteId, provider: connection.provider, ...payment })
		.onConflictDoNothing();
	return true;
}

// Every Visit of the person who paid: the paying Visitor, and every other day's Visitor sharing its identify hash.
// Correlated with the `payments` row of the enclosing query.
function ofPayer(visitTable: typeof payerVisits): SQL {
	const payerIdentity = subquery.select({ identityHash: payer.identityHash }).from(payer).where(eq(payer.id, payments.visitorId));
	const people = subquery.select({ id: samePerson.id }).from(samePerson).where(and(
		eq(samePerson.siteId, payments.siteId),
		or(eq(samePerson.id, payments.visitorId), sql`${samePerson.identityHash} = (${payerIdentity})`),
	));
	return and(eq(visitTable.siteId, payments.siteId), inArray(visitTable.visitorId, people))!;
}

const firstVisitStart = sql<number | null>`(${subquery.select({ startedAt: sql`MIN(${payerVisits.startedAt})` }).from(payerVisits).where(ofPayer(payerVisits))})`;
const firstVisitId = sql<string | null>`(${subquery.select({ id: payerVisits.id }).from(payerVisits).where(ofPayer(payerVisits)).orderBy(asc(payerVisits.startedAt), asc(payerVisits.id)).limit(1)})`;
const visitsBeforePayment = sql<number>`(${subquery.select({ count: count() }).from(payerVisits).where(and(ofPayer(payerVisits), lte(payerVisits.startedAt, payments.paidAt)))})`;
const timeToConvert = sql<number | null>`MAX(${payments.paidAt} - ${firstVisitStart}, 0)`;

// Payments always read raw rows: a Filter keeps those whose Visitor had a matching Visit.
function paymentsIn(siteId: string, { startSec, endSec }: RawWindow, filters: Filter[], currency?: string) {
	return and(
		eq(payments.siteId, siteId),
		gte(payments.paidAt, startSec),
		lt(payments.paidAt, endSec),
		currency ? eq(payments.currency, currency) : undefined,
		byMatchingVisitor(payments.visitorId, filters),
	);
}

const EMPTY_SUMMARY: ConversionsSummary = { revenue: 0, payments: 0, avgOrderValue: 0, avgTimeToConvertSeconds: null };

async function summarizePayments(siteId: string, plan: RangeQueryPlan, timezone: string, filters: Filter[], currency: string): Promise<ConversionsSummary> {
	const window = rawWindowOfPlan(plan, timezone);
	if (!window) {
		return EMPTY_SUMMARY;
	}
	const row = await db.select({
		revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
		payments: count(),
		avgTimeToConvert: sql<number | null>`AVG(${timeToConvert})`,
	}).from(payments).where(paymentsIn(siteId, window, filters, currency)).get();
	const revenue = Number(row?.revenue ?? 0);
	const paymentCount = Number(row?.payments ?? 0);
	return {
		revenue,
		payments: paymentCount,
		avgOrderValue: paymentCount > 0 ? Math.round(revenue / paymentCount) : 0,
		avgTimeToConvertSeconds: row?.avgTimeToConvert === null || row?.avgTimeToConvert === undefined ? null : Number(row.avgTimeToConvert),
	};
}

export async function computeRevenue(site: Site, plan: RangeQueryPlan, filters: Filter[], currency: string): Promise<number> {
	const window = rawWindowOfPlan(plan, site.timezone);
	if (!window) {
		return 0;
	}
	const row = await db.select({ revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
		.from(payments)
		.where(paymentsIn(site.id, window, filters, currency))
		.get();
	return Number(row?.revenue ?? 0);
}

// One point per Overview chart point: hours for single-day and 24-hour Ranges, otherwise the Site's local days.
export async function computeRevenuePoints(site: Site, range: ResolvedRange, filters: Filter[], currency: string, now = Date.now()): Promise<RevenuePoint[]> {
	const hourly = planHourlyWindow(range, site.timezone, now);
	const timestamps = hourly
		? Array.from({ length: hourly.buckets }, (_, hour) => (hourly.firstBucketSec + hour * 3600) * 1000)
		: dateRangeList(range.fromDate, range.toDate).map(date => startOfDayUtcMs(date, site.timezone));
	const window = hourly ?? rawWindowOfPlan(planRangeQuery(range, site.timezone, now), site.timezone);
	if (!window) {
		return timestamps.map(timestamp => ({ timestamp, revenue: 0, payments: 0 }));
	}
	const bucket = hourly
		? sql<number>`CAST((${payments.paidAt} - ${hourly.firstBucketSec}) / 3600 AS INTEGER)`
		: dayIndex(payments.paidAt, daySegments(range.fromDate, range.toDate, site.timezone));
	const rows = await db.select({ bucket, revenue: sql<number>`SUM(${payments.amount})`, payments: count() })
		.from(payments)
		.where(paymentsIn(site.id, window, filters, currency))
		.groupBy(bucket);
	const byBucket = new Map(rows.map(row => [Number(row.bucket), row]));
	return timestamps.map((timestamp, index) => ({
		timestamp,
		revenue: Number(byBucket.get(index)?.revenue ?? 0),
		payments: Number(byBucket.get(index)?.payments ?? 0),
	}));
}

function attributedPayments(where: SQL | undefined) {
	return db.select({
		id: payments.id,
		visitorId: payments.visitorId,
		amount: payments.amount,
		currency: payments.currency,
		paidAt: payments.paidAt,
		firstVisitId: firstVisitId.as("first_visit_id"),
		timeToConvert: timeToConvert.as("time_to_convert"),
		visits: visitsBeforePayment.as("visits_before_payment"),
	}).from(payments).where(where).as("attributed_payments");
}

const sourceLabel = sql<string>`CASE
	WHEN ${sources.id} IS NULL THEN 'Unknown'
	WHEN ${sources.referrerDomain} <> '(direct)' THEN ${sources.referrerDomain}
	ELSE COALESCE(NULLIF(${sources.utmSource}, ''), 'Direct')
END`;

async function breakdowns(siteId: string, window: RawWindow, filters: Filter[], currency: string) {
	const attributed = attributedPayments(paymentsIn(siteId, window, filters, currency));
	const totals = { revenue: sql<number>`SUM(${attributed.amount})`, payments: count() };
	const [sourceRows, countryRows] = await Promise.all([
		db.select({ value: sourceLabel, referrerDomain: sql<string>`COALESCE(${sources.referrerDomain}, '(direct)')`, ...totals })
			.from(attributed)
			.leftJoin(visits, eq(visits.id, attributed.firstVisitId))
			.leftJoin(sources, eq(sources.id, visits.sourceId))
			.groupBy(sourceLabel),
		db.select({ value: sql<string>`COALESCE(${locations.country}, 'Unknown')`, ...totals })
			.from(attributed)
			.leftJoin(visits, eq(visits.id, attributed.firstVisitId))
			.leftJoin(locations, eq(locations.id, visits.locationId))
			.groupBy(locations.country),
	]);
	const byRevenue = <TRow extends RevenueBreakdownRow>(rows: TRow[]) => rows
		.map(row => ({ ...row, revenue: Number(row.revenue), payments: Number(row.payments) }))
		.sort((a, b) => b.revenue - a.revenue || b.payments - a.payments || a.value.localeCompare(b.value));
	return { sources: byRevenue(sourceRows), countries: byRevenue(countryRows) };
}

function placeOf(country: string | null, region: string | null, city: string | null): VisitorPlace | null {
	return country ? { country, region: region || null, city: city || null } : null;
}

async function listPayments(where: SQL | undefined): Promise<PaymentRow[]> {
	const attributed = attributedPayments(where);
	const rows = await db.select({
		id: attributed.id,
		visitorId: attributed.visitorId,
		amount: attributed.amount,
		currency: attributed.currency,
		paidAt: attributed.paidAt,
		timeToConvert: attributed.timeToConvert,
		visits: attributed.visits,
		channel: sources.channel,
		referrerDomain: sources.referrerDomain,
		utmSource: sources.utmSource,
		utmMedium: sources.utmMedium,
		utmCampaign: sources.utmCampaign,
		country: locations.country,
		region: locations.region,
		city: locations.city,
	})
		.from(attributed)
		.leftJoin(visits, eq(visits.id, attributed.firstVisitId))
		.leftJoin(sources, eq(sources.id, visits.sourceId))
		.leftJoin(locations, eq(locations.id, visits.locationId))
		.orderBy(desc(attributed.paidAt), asc(attributed.id))
		.limit(ROW_LIMIT);

	return rows.map((row): PaymentRow => ({
		id: row.id,
		visitorId: row.visitorId,
		amount: row.amount,
		currency: row.currency,
		paidAt: row.paidAt,
		source: row.channel
			? { channel: row.channel, referrerDomain: row.referrerDomain ?? "(direct)", utmSource: row.utmSource, utmMedium: row.utmMedium, utmCampaign: row.utmCampaign } satisfies VisitorSource
			: null,
		location: placeOf(row.country, row.region, row.city),
		timeToConvertSeconds: row.timeToConvert === null ? null : Number(row.timeToConvert),
		visits: Number(row.visits),
	}));
}

// Without a connection there is no currency to sum, but Payments recorded before disconnecting are still listed.
export async function computeConversions(site: Site, range: ResolvedRange, filters: Filter[], currency: string | null) {
	const now = Date.now();
	const plan = planRangeQuery(range, site.timezone, now);
	const window = rawWindowOfPlan(plan, site.timezone);
	const [summary, previous, points, rows, totalRow, breakdown] = await Promise.all([
		currency ? summarizePayments(site.id, plan, site.timezone, filters, currency) : EMPTY_SUMMARY,
		currency ? summarizePayments(site.id, planPreviousRangeQuery(range, site.timezone, now), site.timezone, filters, currency) : EMPTY_SUMMARY,
		currency ? computeRevenuePoints(site, range, filters, currency, now) : [],
		window ? listPayments(paymentsIn(site.id, window, filters)) : [],
		window ? db.select({ total: count() }).from(payments).where(paymentsIn(site.id, window, filters)).get() : undefined,
		window && currency ? breakdowns(site.id, window, filters, currency) : { sources: [], countries: [] },
	]);
	return { summary: { ...summary, previous }, points, rows, total: Number(totalRow?.total ?? 0), ...breakdown };
}

// Not narrowed by the Range or Filters, like the Visitor profile it opens beside.
export async function getPayment(siteId: string, paymentId: string): Promise<PaymentRow | undefined> {
	const [row] = await listPayments(and(eq(payments.siteId, siteId), eq(payments.id, paymentId)));
	return row;
}

export function getPaymentCustomers(siteId: string, paymentIds: string[]) {
	return db.select({ id: payments.id, customerId: payments.providerCustomerId }).from(payments)
		.where(and(eq(payments.siteId, siteId), inValues(payments.id, paymentIds)));
}

// A page earns the Revenue of every Payment whose payer viewed it before paying, once per Payment.
export async function computePageRevenue(siteId: string, window: RawWindow, filters: Filter[], currency: string, paths: string[]): Promise<Map<string, number>> {
	const credited = db.selectDistinct({ path: pages.path, paymentId: payments.id, amount: payments.amount })
		.from(payments)
		.innerJoin(payerVisits, ofPayer(payerVisits))
		.innerJoin(pages, and(eq(pages.visitId, payerVisits.id), lte(pages.timestamp, payments.paidAt)))
		.where(and(paymentsIn(siteId, window, filters, currency), inValues(pages.path, paths)))
		.as("credited_pages");
	const rows = await db.select({ path: credited.path, revenue: sql<number>`SUM(${credited.amount})` }).from(credited).groupBy(credited.path);
	return new Map(rows.map(row => [row.path, Number(row.revenue)]));
}

// Each Site counts only Payments in its connection's currency; Sites without a connection have no Revenue.
export async function computeOrganizationRevenue(organizationId: string, previousStartSec: number, startSec: number, endSec: number) {
	const [connections, rows] = await Promise.all([
		db.select({ siteId: revenueConnections.siteId, currency: revenueConnections.currency })
			.from(revenueConnections)
			.where(inOrganization(revenueConnections.siteId, organizationId)),
		db.select({
			siteId: payments.siteId,
			revenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paidAt} >= ${startSec} THEN ${payments.amount} END), 0)`,
			previousRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.paidAt} < ${startSec} THEN ${payments.amount} END), 0)`,
		})
			.from(payments)
			.innerJoin(revenueConnections, and(eq(revenueConnections.siteId, payments.siteId), eq(revenueConnections.currency, payments.currency)))
			.where(and(inOrganization(payments.siteId, organizationId), gte(payments.paidAt, previousStartSec), lt(payments.paidAt, endSec)))
			.groupBy(payments.siteId),
	]);
	const revenueBySite = new Map(rows.map(row => [row.siteId, { revenue: Number(row.revenue), previousRevenue: Number(row.previousRevenue) }]));
	return new Map(connections.map(connection => [connection.siteId, {
		currency: connection.currency,
		...(revenueBySite.get(connection.siteId) ?? { revenue: 0, previousRevenue: 0 }),
	}]));
}

export function listOrganizationRevenueConnections(organizationId: string): Promise<RevenueConnectionRow[]> {
	return db.select().from(revenueConnections).where(inOrganization(revenueConnections.siteId, organizationId));
}
