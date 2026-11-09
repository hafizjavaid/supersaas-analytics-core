import type { DigestFigure, DigestFigures } from "../types/digests";
import { dateRangeList, shiftDate } from "./dates";
import { formatChange, formatCount, formatDuration, formatPercent, percentChange } from "./format";
import { formatRevenue } from "./revenue";

export const DIGEST_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export type DigestFrequency = typeof DIGEST_FREQUENCIES[number];

export const DIGEST_SETTINGS = ["off", ...DIGEST_FREQUENCIES] as const;

export type DigestSetting = typeof DIGEST_SETTINGS[number];

export const DIGEST_SETTING_LABELS: Record<DigestSetting, string> = {
	off: "Off",
	daily: "Daily",
	weekly: "Weekly",
	monthly: "Monthly",
};

export const DIGEST_TITLES: Record<DigestFrequency, string> = {
	daily: "Daily Digest",
	weekly: "Weekly Digest",
	monthly: "Monthly Digest",
};

export interface DigestPeriod {
	fromDate: string;
	toDate: string;
}

export interface CountedLabel {
	label: string;
	count: number;
}

export interface DigestMover {
	label: string;
	current: number;
	previous: number;
}

const MOVER_LIMIT = 5;

function weekdayOf(date: string) {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Weeks run Monday to Sunday and months are calendar months, so a Digest is due only on the day its period ends.
export function digestPeriodEnding(frequency: DigestFrequency, lastDay: string): DigestPeriod | null {
	if (frequency === "daily") {
		return { fromDate: lastDay, toDate: lastDay };
	}
	if (frequency === "weekly") {
		return weekdayOf(lastDay) === 0 ? { fromDate: shiftDate(lastDay, -6), toDate: lastDay } : null;
	}
	return shiftDate(lastDay, 1).endsWith("-01") ? { fromDate: `${lastDay.slice(0, 8)}01`, toDate: lastDay } : null;
}

// The Previous period of the glossary: equal length, so a month is compared with the 28 to 31 days before it.
export function previousDigestPeriod({ fromDate, toDate }: DigestPeriod): DigestPeriod {
	const days = dateRangeList(fromDate, toDate).length;
	return { fromDate: shiftDate(fromDate, -days), toDate: shiftDate(toDate, -days) };
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}

export function digestPeriodLabel(frequency: DigestFrequency, { fromDate, toDate }: DigestPeriod): string {
	if (frequency === "daily") {
		return formatDate(fromDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
	}
	if (frequency === "monthly") {
		return formatDate(fromDate, { month: "long", year: "numeric" });
	}
	return formatDateSpan({ fromDate, toDate });
}

export function formatDateSpan({ fromDate, toDate }: DigestPeriod): string {
	const to = formatDate(toDate, { month: "long", day: "numeric", year: "numeric" });
	if (fromDate === toDate) {
		return to;
	}
	const sameYear = fromDate.slice(0, 4) === toDate.slice(0, 4);
	return `${formatDate(fromDate, { month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${to}`;
}

export function topMovers(current: CountedLabel[], previous: CountedLabel[], limit = MOVER_LIMIT): DigestMover[] {
	const movers = new Map<string, DigestMover>();
	for (const { label, count } of current) {
		movers.set(label, { label, current: count, previous: 0 });
	}
	for (const { label, count } of previous) {
		movers.set(label, { label, current: movers.get(label)?.current ?? 0, previous: count });
	}
	const change = (mover: DigestMover) => Math.abs(mover.current - mover.previous);
	return [...movers.values()]
		.filter(mover => change(mover) > 0)
		.sort((a, b) => change(b) - change(a) || a.label.localeCompare(b.label))
		.slice(0, limit);
}

export function formatMoverChange({ current, previous }: DigestMover): string {
	const difference = current - previous;
	return `${difference > 0 ? "+" : ""}${formatCount(difference)}`;
}

export interface DigestFigureRow {
	label: string;
	current: string;
	previous: string;
	change: string | null;
	// Null when nothing changed or the previous period was empty.
	improved: boolean | null;
}

function figureRow(label: string, { current, previous }: DigestFigure, format: (value: number) => string, higherIsBetter = true): DigestFigureRow {
	const change = percentChange(current, previous);
	const formatted = change === null ? null : formatChange(change);
	return {
		label,
		current: format(current),
		previous: format(previous),
		change: formatted,
		improved: change === null || formatted === "0%" ? null : (change > 0) === higherIsBetter,
	};
}

export function digestFigureRows(figures: DigestFigures, currency: string | null): DigestFigureRow[] {
	return [
		figureRow("Visitors", figures.visitors, formatCount),
		figureRow("Visits", figures.visits, formatCount),
		figureRow("Pageviews", figures.pageviews, formatCount),
		figureRow("Bounce rate", figures.bounceRate, formatPercent, false),
		figureRow("Visit duration", figures.avgDurationSeconds, formatDuration),
		...(figures.conversionRate ? [figureRow("Conversion rate", figures.conversionRate, formatPercent)] : []),
		...(figures.revenue && currency ? [figureRow("Revenue", figures.revenue, value => formatRevenue(value, currency))] : []),
	];
}
