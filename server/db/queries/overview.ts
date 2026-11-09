import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "hub:db";
import type { Site, Summary, SummaryWithPrevious, TimeseriesPoint } from "#layers/core/shared/types/analytics";
import type { HourlyWindow, RangeQueryPlan, RawWindow, ResolvedRange } from "#layers/core/shared/utils/dates";
import { dateRangeList, daySegments, planHourlyWindow, planPreviousRangeQuery, planRangeQuery, rawWindowOfPlan, startOfDayUtcMs } from "#layers/core/shared/utils/dates";
import type { Filter } from "#layers/core/shared/utils/filters";
import { dayIndex, inMatchingVisit, planReport, visitMatches } from "#layers/core/server/db/queries/filters";
import { computeConversionPoints, computeConversionRate, listGoals } from "#layers/core/server/db/queries/goals";
import { computeRevenue, computeRevenuePoints, getRevenueConnection } from "#layers/core/server/db/queries/revenue";
import { tables } from "#layers/core/server/utils/database";

const { dailySummary, pages, visits } = tables;

async function computeRawStats(siteId: string, { startSec, endSec }: RawWindow, filters: Filter[]): Promise<Summary> {
	const [visitRow, pageRow] = await Promise.all([
		db.select({
			visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`,
			visits: sql<number>`COUNT(*)`,
			bounceRate: sql<number>`COALESCE(AVG(${visits.isBounce}), 0)`,
			avgDuration: sql<number>`COALESCE(AVG(${visits.endedAt} - ${visits.startedAt}), 0)`,
		}).from(visits).where(and(
			eq(visits.siteId, siteId),
			gte(visits.startedAt, startSec),
			lt(visits.startedAt, endSec),
			visitMatches(filters),
		)).get(),
		db.select({ pageviews: sql<number>`COUNT(*)` }).from(pages).where(and(
			eq(pages.siteId, siteId),
			gte(pages.timestamp, startSec),
			lt(pages.timestamp, endSec),
			inMatchingVisit(pages.visitId, filters),
		)).get(),
	]);

	return {
		visitors: Number(visitRow?.visitors ?? 0),
		visits: Number(visitRow?.visits ?? 0),
		pageviews: Number(pageRow?.pageviews ?? 0),
		bounceRate: Number(visitRow?.bounceRate ?? 0),
		avgDurationSeconds: Number(visitRow?.avgDuration ?? 0),
	};
}

function rollupSummaryRows(siteId: string, bounds: { from: string; to: string } | null) {
	if (!bounds) {
		return Promise.resolve([]);
	}
	return db.select().from(dailySummary).where(and(
		eq(dailySummary.siteId, siteId),
		gte(dailySummary.date, bounds.from),
		lte(dailySummary.date, bounds.to),
	)).orderBy(asc(dailySummary.date));
}

// Multi-day visitors are the sum of each day's distinct Visitors: a Rollup only keeps per-day distinct counts, so a Visitor seen on two days counts twice.
async function summarizePlan(siteId: string, plan: RangeQueryPlan, filters: Filter[]): Promise<Summary> {
	const [rollupRows, rawStats] = await Promise.all([
		rollupSummaryRows(siteId, plan.rollupBounds),
		plan.raw ? computeRawStats(siteId, plan.raw, filters) : null,
	]);

	const parts: Summary[] = [...rollupRows, ...(rawStats ? [rawStats] : [])];
	const totals = parts.reduce((sum, part) => ({
		visitors: sum.visitors + part.visitors,
		visits: sum.visits + part.visits,
		pageviews: sum.pageviews + part.pageviews,
		bounceWeighted: sum.bounceWeighted + part.bounceRate * part.visits,
		durationWeighted: sum.durationWeighted + part.avgDurationSeconds * part.visits,
	}), { visitors: 0, visits: 0, pageviews: 0, bounceWeighted: 0, durationWeighted: 0 });

	return {
		visitors: totals.visitors,
		visits: totals.visits,
		pageviews: totals.pageviews,
		bounceRate: totals.visits > 0 ? totals.bounceWeighted / totals.visits : 0,
		avgDurationSeconds: totals.visits > 0 ? totals.durationWeighted / totals.visits : 0,
	};
}

export function computeRangeSummary(site: Site, range: ResolvedRange, filters: Filter[], now = Date.now()): Promise<Summary> {
	return summarizePlan(site.id, planReport(planRangeQuery(range, site.timezone, now), filters, site.timezone), filters);
}

export async function computeSummary(site: Site, range: ResolvedRange, filters: Filter[]): Promise<SummaryWithPrevious> {
	const now = Date.now();
	const currentPlan = planRangeQuery(range, site.timezone, now);
	const previousPlan = planPreviousRangeQuery(range, site.timezone, now);
	const [goals, connection] = await Promise.all([listGoals(site.id), getRevenueConnection(site.id)]);
	const currency = connection?.currency ?? null;
	const [current, previous, conversionRate, previousConversionRate, revenue, previousRevenue] = await Promise.all([
		summarizePlan(site.id, planReport(currentPlan, filters, site.timezone), filters),
		summarizePlan(site.id, planReport(previousPlan, filters, site.timezone), filters),
		computeConversionRate(site, currentPlan, goals, filters),
		computeConversionRate(site, previousPlan, goals, filters),
		currency ? computeRevenue(site, currentPlan, filters, currency) : null,
		currency ? computeRevenue(site, previousPlan, filters, currency) : null,
	]);
	return {
		...current,
		conversionRate,
		revenue,
		currency,
		previous: { ...previous, conversionRate: previousConversionRate, revenue: previousRevenue },
	};
}

export async function computeTimeseries(site: Site, range: ResolvedRange, filters: Filter[]): Promise<TimeseriesPoint[]> {
	const now = Date.now();
	const [points, goals, connection] = await Promise.all([computeVisitPoints(site, range, filters, now), listGoals(site.id), getRevenueConnection(site.id)]);
	const [conversionRates, revenuePoints] = await Promise.all([
		goals.length > 0 ? computeConversionPoints(site, range, goals, filters, now) : null,
		connection ? computeRevenuePoints(site, range, filters, connection.currency, now) : null,
	]);
	return points.map((point, index) => ({
		...point,
		...(conversionRates && { conversionRate: conversionRates[index] ?? 0 }),
		...(revenuePoints && { revenue: revenuePoints[index]?.revenue ?? 0 }),
	}));
}

async function computeVisitPoints(site: Site, range: ResolvedRange, filters: Filter[], now: number): Promise<TimeseriesPoint[]> {
	const hourly = planHourlyWindow(range, site.timezone, now);
	if (hourly) {
		return computeHourlyPoints(site.id, hourly, filters);
	}
	if (filters.length > 0) {
		return computeFilteredDailyPoints(site, range, filters, now);
	}

	const { rollupDates, rollupBounds, raw } = planRangeQuery(range, site.timezone, now);
	const [rollupRows, today] = await Promise.all([
		rollupSummaryRows(site.id, rollupBounds),
		raw ? computeRawStats(site.id, raw, []) : null,
	]);

	const rowsByDate = new Map(rollupRows.map(row => [row.date, row]));
	const points: TimeseriesPoint[] = rollupDates.map((date) => {
		const row = rowsByDate.get(date);
		return {
			timestamp: startOfDayUtcMs(date, site.timezone),
			visitors: row?.visitors ?? 0,
			pageviews: row?.pageviews ?? 0,
			bounceRate: row?.bounceRate ?? 0,
			avgDurationSeconds: row?.avgDurationSeconds ?? 0,
		};
	});

	if (raw && today) {
		points.push({
			timestamp: raw.startSec * 1000,
			visitors: today.visitors,
			pageviews: today.pageviews,
			bounceRate: today.bounceRate,
			avgDurationSeconds: today.avgDurationSeconds,
		});
	}
	return points;
}

// A single day has one Rollup row at most, which charts as a dot, so short Ranges are bucketed by hour from the raw tables, even for a past day.
async function computeHourlyPoints(siteId: string, window: HourlyWindow, filters: Filter[]): Promise<TimeseriesPoint[]> {
	const { firstBucketSec } = window;
	const pageHour = sql<number>`CAST((${pages.timestamp} - ${firstBucketSec}) / 3600 AS INTEGER)`;
	const visitHour = sql<number>`CAST((${visits.startedAt} - ${firstBucketSec}) / 3600 AS INTEGER)`;
	const buckets = await countRawBuckets(siteId, window, filters, pageHour, visitHour);

	return Array.from({ length: window.buckets }, (_, hour) => ({
		timestamp: (firstBucketSec + hour * 3600) * 1000,
		...buckets(hour),
	}));
}

// Filtered Ranges read raw rows, so each day is bucketed in SQL by the Site's local midnights rather than read from its Rollup.
async function computeFilteredDailyPoints(site: Site, range: ResolvedRange, filters: Filter[], now: number): Promise<TimeseriesPoint[]> {
	const window = rawWindowOfPlan(planRangeQuery(range, site.timezone, now), site.timezone);
	if (!window) {
		return [];
	}
	const segments = daySegments(range.fromDate, range.toDate, site.timezone);
	const buckets = await countRawBuckets(site.id, window, filters, dayIndex(pages.timestamp, segments), dayIndex(visits.startedAt, segments));

	return dateRangeList(range.fromDate, range.toDate).map((date, day) => ({
		timestamp: startOfDayUtcMs(date, site.timezone),
		...buckets(day),
	}));
}

async function countRawBuckets(siteId: string, { startSec, endSec }: RawWindow, filters: Filter[], pageBucket: SQL<number>, visitBucket: SQL<number>) {
	const [pageRows, visitRows] = await Promise.all([
		db.select({ bucket: pageBucket, pageviews: sql<number>`COUNT(*)` }).from(pages).where(and(
			eq(pages.siteId, siteId),
			gte(pages.timestamp, startSec),
			lt(pages.timestamp, endSec),
			inMatchingVisit(pages.visitId, filters),
		)).groupBy(pageBucket),
		db.select({
			bucket: visitBucket,
			visitors: sql<number>`COUNT(DISTINCT ${visits.visitorId})`,
			bounceRate: sql<number>`COALESCE(AVG(${visits.isBounce}), 0)`,
			avgDuration: sql<number>`COALESCE(AVG(${visits.endedAt} - ${visits.startedAt}), 0)`,
		}).from(visits).where(and(
			eq(visits.siteId, siteId),
			gte(visits.startedAt, startSec),
			lt(visits.startedAt, endSec),
			visitMatches(filters),
		)).groupBy(visitBucket),
	]);

	const pageviewsByBucket = new Map(pageRows.map(row => [Number(row.bucket), Number(row.pageviews)]));
	const visitsByBucket = new Map(visitRows.map(row => [Number(row.bucket), row]));

	return (bucket: number) => {
		const visitRow = visitsByBucket.get(bucket);
		return {
			visitors: Number(visitRow?.visitors ?? 0),
			pageviews: pageviewsByBucket.get(bucket) ?? 0,
			bounceRate: Number(visitRow?.bounceRate ?? 0),
			avgDurationSeconds: Number(visitRow?.avgDuration ?? 0),
		};
	};
}
