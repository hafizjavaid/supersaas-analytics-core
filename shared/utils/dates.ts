export const RANGE_KEYS = ["today", "yesterday", "24h", "7d", "30d", "90d", "6m", "12m", "custom"] as const;

export type RangeKey = typeof RANGE_KEYS[number];

export interface ResolvedRange {
	fromDate: string;
	toDate: string;
	today: string;
	// Set for a rolling window ending now, which reads raw rows only; fromDate and toDate then just label it.
	hours?: number;
}

export interface RawWindow {
	startSec: number;
	endSec: number;
}

// Past days come from Rollups and the rest from raw rows in `raw`, a half-open [startSec, endSec) window.
export interface RangeQueryPlan {
	rollupDates: string[];
	rollupBounds: { from: string; to: string } | null;
	raw: RawWindow | null;
}

const RANGE_DAYS: Record<Exclude<RangeKey, "custom" | "today" | "yesterday" | "24h">, number> = {
	"7d": 6,
	"30d": 29,
	"90d": 89,
	"6m": 182,
	"12m": 364,
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_SEC = 3600;
export const DAY_SEC = 86_400;

export function isRangeKey(value: unknown): value is RangeKey {
	return RANGE_KEYS.includes(value as RangeKey);
}

function datePartsInTz(date: Date, timezone: string, options: Intl.DateTimeFormatOptions) {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).formatToParts(date);
	return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function formatDateInTz(date: Date, timezone: string): string {
	const parts = datePartsInTz(date, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
	return `${parts.year}-${parts.month}-${parts.day}`;
}

export function todayInTz(timezone: string): string {
	return formatDateInTz(new Date(), timezone);
}

export function shiftDate(date: string, days: number): string {
	const shifted = new Date(`${date}T00:00:00Z`);
	shifted.setUTCDate(shifted.getUTCDate() + days);
	return shifted.toISOString().slice(0, 10);
}

function timezoneOffsetMinutes(timezone: string, date: Date): number {
	const parts = datePartsInTz(date, timezone, {
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const wallClockAsUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
	);
	return (wallClockAsUtc - date.getTime()) / 60_000;
}

// The offset is sampled once at UTC midnight, so a DST switch can shift a day boundary by up to an hour; daily Rollups tolerate that.
export function startOfDayUtcMs(date: string, timezone: string): number {
	const utcMidnight = Date.parse(`${date}T00:00:00Z`);
	return utcMidnight - timezoneOffsetMinutes(timezone, new Date(utcMidnight)) * 60_000;
}

function startOfDaySec(date: string, timezone: string): number {
	return Math.floor(startOfDayUtcMs(date, timezone) / 1000);
}

export function dateRangeList(fromDate: string, toDate: string): string[] {
	const dates: string[] = [];
	for (let date = fromDate; date <= toDate; date = shiftDate(date, 1)) {
		dates.push(date);
	}
	return dates;
}

function isDate(value: unknown): value is string {
	return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// A custom Range never reaches past today, so its previous period stays the same length as the days that can have data.
function customDates(today: string, customFrom: unknown, customTo: unknown) {
	if (!isDate(customFrom) || !isDate(customTo)) {
		return { fromDate: today, toDate: today };
	}
	const [first, last] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
	return { fromDate: first < today ? first : today, toDate: last < today ? last : today };
}

export function resolveRange(range: RangeKey, timezone: string, customFrom?: unknown, customTo?: unknown): ResolvedRange {
	const now = new Date();
	const today = formatDateInTz(now, timezone);

	switch (range) {
		case "custom":
			return { ...customDates(today, customFrom, customTo), today };
		case "today":
			return { fromDate: today, toDate: today, today };
		case "yesterday":
			return { fromDate: shiftDate(today, -1), toDate: shiftDate(today, -1), today };
		case "24h":
			return { fromDate: formatDateInTz(new Date(now.getTime() - 24 * HOUR_SEC * 1000), timezone), toDate: today, today, hours: 24 };
		default:
			return { fromDate: shiftDate(today, -RANGE_DAYS[range]), toDate: today, today };
	}
}

function endOfNowSec(nowMs: number) {
	return Math.floor(nowMs / 1000) + 1;
}

function rollupPlan(rollupDates: string[], raw: RawWindow | null): RangeQueryPlan {
	const rollupBounds = rollupDates.length > 0
		? { from: rollupDates[0]!, to: rollupDates[rollupDates.length - 1]! }
		: null;
	return { rollupDates, rollupBounds, raw };
}

// D1 caps a statement at 100 bound parameters, so queries use `rollupBounds` with BETWEEN and never `inArray(rollupDates)`.
export function planRangeQuery(range: ResolvedRange, timezone: string, nowMs = Date.now()): RangeQueryPlan {
	const endSec = endOfNowSec(nowMs);
	if (range.hours) {
		return rollupPlan([], { startSec: endSec - range.hours * HOUR_SEC, endSec });
	}
	const dates = dateRangeList(range.fromDate, range.toDate);
	const raw = dates.includes(range.today) ? { startSec: startOfDaySec(range.today, timezone), endSec } : null;
	return rollupPlan(dates.filter(date => date < range.today), raw);
}

// A plan's Rollup days and raw window are contiguous, so together they are one raw window over the same span.
export function rawWindowOfPlan(plan: RangeQueryPlan, timezone: string): RawWindow | null {
	if (!plan.rollupBounds) {
		return plan.raw;
	}
	return {
		startSec: startOfDaySec(plan.rollupBounds.from, timezone),
		endSec: plan.raw?.endSec ?? startOfDaySec(shiftDate(plan.rollupBounds.to, 1), timezone),
	};
}

export interface DaySegment {
	startSec: number;
	firstIndex: number;
	// A uniform segment is a run of 24-hour days; any other day (a DST switch) is a segment of its own.
	uniform: boolean;
}

// Day i covers [startOfDay(dates[i]), startOfDay(dates[i + 1])), the same bounds the Rollup uses. SQL turns a timestamp into its day index with one CASE branch per segment.
export function daySegments(fromDate: string, toDate: string, timezone: string): DaySegment[] {
	const segments: DaySegment[] = [];
	dateRangeList(fromDate, toDate).forEach((date, index) => {
		const startSec = startOfDaySec(date, timezone);
		const uniform = startOfDaySec(shiftDate(date, 1), timezone) - startSec === DAY_SEC;
		if (!(uniform && segments.at(-1)?.uniform)) {
			segments.push({ startSec, firstIndex: index, uniform });
		}
	});
	return segments;
}

export function rangeLengthInDays(range: ResolvedRange): number {
	return dateRangeList(range.fromDate, range.toDate).length;
}

// The equal-length span just before the Range. When the Range ends in a partial today, its counterpart day is cut at the same time of day, from raw rows, so a morning is not compared with a whole day.
export function planPreviousRangeQuery(range: ResolvedRange, timezone: string, nowMs = Date.now()): RangeQueryPlan {
	const current = planRangeQuery(range, timezone, nowMs);
	if (range.hours) {
		const length = range.hours * HOUR_SEC;
		return rollupPlan([], { startSec: current.raw!.startSec - length, endSec: current.raw!.startSec });
	}

	const days = rangeLengthInDays(range);
	const previousDates = dateRangeList(shiftDate(range.fromDate, -days), shiftDate(range.toDate, -days));
	if (!current.raw) {
		return rollupPlan(previousDates, null);
	}
	const counterpart = shiftDate(range.today, -days);
	const counterpartStart = startOfDaySec(counterpart, timezone);
	const elapsed = current.raw.endSec - current.raw.startSec;
	return rollupPlan(
		previousDates.filter(date => date < counterpart),
		{ startSec: counterpartStart, endSec: counterpartStart + elapsed },
	);
}

export interface HourlyWindow extends RawWindow {
	firstBucketSec: number;
	buckets: number;
}

// Rolling windows and single days chart by the hour, from raw rows, in the Site's local hours. Longer Ranges chart by day.
export function planHourlyWindow(range: ResolvedRange, timezone: string, nowMs = Date.now()): HourlyWindow | null {
	const endOfNow = endOfNowSec(nowMs);
	let window: RawWindow;
	let alignSec: number;
	if (range.hours) {
		window = { startSec: endOfNow - range.hours * HOUR_SEC, endSec: endOfNow };
		alignSec = startOfDaySec(range.today, timezone);
	}
	else if (range.fromDate === range.toDate) {
		alignSec = startOfDaySec(range.fromDate, timezone);
		window = { startSec: alignSec, endSec: Math.min(startOfDaySec(shiftDate(range.fromDate, 1), timezone), endOfNow) };
	}
	else {
		return null;
	}
	const firstBucketSec = alignSec + Math.floor((window.startSec - alignSec) / HOUR_SEC) * HOUR_SEC;
	const buckets = Math.max(0, Math.ceil((window.endSec - firstBucketSec) / HOUR_SEC));
	return { ...window, firstBucketSec, buckets };
}
