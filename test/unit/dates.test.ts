import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateRangeList, daySegments, isRangeKey, planHourlyWindow, planPreviousRangeQuery, planRangeQuery, rawWindowOfPlan, resolveRange, shiftDate, startOfDayUtcMs } from "#layers/core/shared/utils/dates";

describe("startOfDayUtcMs", () => {
	it("is midnight UTC for UTC", () => {
		expect(new Date(startOfDayUtcMs("2026-03-10", "UTC")).toISOString()).toBe("2026-03-10T00:00:00.000Z");
	});

	it("is the previous UTC evening for a timezone ahead of UTC", () => {
		expect(new Date(startOfDayUtcMs("2026-01-15", "Europe/Zurich")).toISOString()).toBe("2026-01-14T23:00:00.000Z");
	});

	it("follows daylight saving time for a timezone ahead of UTC", () => {
		expect(new Date(startOfDayUtcMs("2026-07-15", "Europe/Zurich")).toISOString()).toBe("2026-07-14T22:00:00.000Z");
	});

	it("is the next UTC morning for a timezone behind UTC", () => {
		expect(new Date(startOfDayUtcMs("2026-01-15", "America/Los_Angeles")).toISOString()).toBe("2026-01-15T08:00:00.000Z");
	});

	it("handles half-hour offsets", () => {
		expect(new Date(startOfDayUtcMs("2026-01-15", "Asia/Kolkata")).toISOString()).toBe("2026-01-14T18:30:00.000Z");
	});
});

const NOW = new Date("2026-05-20T23:30:00Z");
const NOW_MS = NOW.getTime();
const NOW_END_SEC = NOW_MS / 1000 + 1;

function seconds(iso: string) {
	return Date.parse(iso) / 1000;
}

describe("resolveRange", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves today in the Site's timezone, which can already be tomorrow in UTC", () => {
		expect(resolveRange("today", "UTC")).toEqual({ fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-20" });
		expect(resolveRange("today", "Asia/Tokyo")).toEqual({ fromDate: "2026-05-21", toDate: "2026-05-21", today: "2026-05-21" });
	});

	it("resolves yesterday as the day before the Site's today", () => {
		expect(resolveRange("yesterday", "UTC")).toEqual({ fromDate: "2026-05-19", toDate: "2026-05-19", today: "2026-05-20" });
		expect(resolveRange("yesterday", "Asia/Tokyo")).toEqual({ fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-21" });
		expect(resolveRange("yesterday", "America/Los_Angeles")).toEqual({ fromDate: "2026-05-19", toDate: "2026-05-19", today: "2026-05-20" });
	});

	it("resolves the last 24 hours as a rolling window labelled with the local dates it spans", () => {
		expect(resolveRange("24h", "UTC")).toEqual({ fromDate: "2026-05-19", toDate: "2026-05-20", today: "2026-05-20", hours: 24 });
		expect(resolveRange("24h", "Asia/Tokyo")).toEqual({ fromDate: "2026-05-20", toDate: "2026-05-21", today: "2026-05-21", hours: 24 });
	});

	it.each([
		["7d", "2026-05-14"],
		["30d", "2026-04-21"],
		["90d", "2026-02-20"],
		["6m", "2025-11-19"],
		["12m", "2025-05-21"],
	] as const)("resolves %s to end today", (range, fromDate) => {
		expect(resolveRange(range, "UTC")).toEqual({ fromDate, toDate: "2026-05-20", today: "2026-05-20" });
	});

	it("uses from and to for a custom Range", () => {
		expect(resolveRange("custom", "UTC", "2026-01-01", "2026-01-31")).toEqual({ fromDate: "2026-01-01", toDate: "2026-01-31", today: "2026-05-20" });
	});

	it("swaps a custom Range given backwards", () => {
		expect(resolveRange("custom", "UTC", "2026-01-31", "2026-01-01")).toMatchObject({ fromDate: "2026-01-01", toDate: "2026-01-31" });
	});

	it("ends a custom Range at today at the latest", () => {
		expect(resolveRange("custom", "UTC", "2026-05-01", "2026-06-30")).toMatchObject({ fromDate: "2026-05-01", toDate: "2026-05-20" });
		expect(resolveRange("custom", "UTC", "2026-06-01", "2026-06-30")).toMatchObject({ fromDate: "2026-05-20", toDate: "2026-05-20" });
	});

	it("falls back to today for a custom Range without valid bounds", () => {
		expect(resolveRange("custom", "UTC")).toEqual({ fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-20" });
		expect(resolveRange("custom", "UTC", "2026-13-01", "2026-01-31")).toMatchObject({ fromDate: "2026-05-20", toDate: "2026-05-20" });
		expect(resolveRange("custom", "UTC", "yesterday", "2026-01-31")).toMatchObject({ fromDate: "2026-05-20", toDate: "2026-05-20" });
	});
});

describe("planRangeQuery", () => {
	it("reads past days from Rollups and today from raw rows since the Site's midnight", () => {
		expect(planRangeQuery({ fromDate: "2026-05-18", toDate: "2026-05-20", today: "2026-05-20" }, "UTC", NOW_MS)).toEqual({
			rollupDates: ["2026-05-18", "2026-05-19"],
			rollupBounds: { from: "2026-05-18", to: "2026-05-19" },
			raw: { startSec: seconds("2026-05-20T00:00:00Z"), endSec: NOW_END_SEC },
		});
	});

	it("starts today's raw rows at the Site's local midnight", () => {
		expect(planRangeQuery({ fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-20" }, "America/Los_Angeles", NOW_MS).raw)
			.toEqual({ startSec: seconds("2026-05-20T07:00:00Z"), endSec: NOW_END_SEC });
		expect(planRangeQuery({ fromDate: "2026-05-21", toDate: "2026-05-21", today: "2026-05-21" }, "Asia/Kolkata", NOW_MS).raw)
			.toEqual({ startSec: seconds("2026-05-20T18:30:00Z"), endSec: NOW_END_SEC });
	});

	it("has no Rollup days for today alone", () => {
		expect(planRangeQuery({ fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-20" }, "UTC", NOW_MS)).toMatchObject({ rollupBounds: null, rollupDates: [] });
	});

	it("reads only Rollups for yesterday and other past Ranges", () => {
		expect(planRangeQuery({ fromDate: "2026-05-19", toDate: "2026-05-19", today: "2026-05-20" }, "UTC", NOW_MS)).toEqual({
			rollupDates: ["2026-05-19"],
			rollupBounds: { from: "2026-05-19", to: "2026-05-19" },
			raw: null,
		});
	});

	it("reads the last 24 hours only from raw rows, whatever the timezone", () => {
		const range = { fromDate: "2026-05-20", toDate: "2026-05-21", today: "2026-05-21", hours: 24 };
		const expected = { rollupDates: [], rollupBounds: null, raw: { startSec: NOW_END_SEC - 86_400, endSec: NOW_END_SEC } };
		expect(planRangeQuery(range, "Asia/Tokyo", NOW_MS)).toEqual(expected);
		expect(planRangeQuery(range, "America/Los_Angeles", NOW_MS)).toEqual(expected);
	});
});

describe("planPreviousRangeQuery", () => {
	it("compares the last 24 hours with the 24 hours before", () => {
		const range = { fromDate: "2026-05-19", toDate: "2026-05-20", today: "2026-05-20", hours: 24 };
		expect(planPreviousRangeQuery(range, "UTC", NOW_MS)).toEqual({
			rollupDates: [],
			rollupBounds: null,
			raw: { startSec: NOW_END_SEC - 2 * 86_400, endSec: NOW_END_SEC - 86_400 },
		});
	});

	it("compares yesterday with the day before, from Rollups", () => {
		expect(planPreviousRangeQuery({ fromDate: "2026-05-19", toDate: "2026-05-19", today: "2026-05-20" }, "UTC", NOW_MS)).toEqual({
			rollupDates: ["2026-05-18"],
			rollupBounds: { from: "2026-05-18", to: "2026-05-18" },
			raw: null,
		});
	});

	it("compares a past custom Range with the same number of days before it", () => {
		expect(planPreviousRangeQuery({ fromDate: "2026-03-01", toDate: "2026-03-10", today: "2026-05-20" }, "UTC", NOW_MS).rollupBounds)
			.toEqual({ from: "2026-02-19", to: "2026-02-28" });
	});

	it("compares today with yesterday up to the same time of day", () => {
		const range = { fromDate: "2026-05-21", toDate: "2026-05-21", today: "2026-05-21" };
		const yesterdayStart = seconds("2026-05-19T15:00:00Z");
		expect(planPreviousRangeQuery(range, "Asia/Tokyo", NOW_MS)).toEqual({
			rollupDates: [],
			rollupBounds: null,
			raw: { startSec: yesterdayStart, endSec: yesterdayStart + NOW_END_SEC - seconds("2026-05-20T15:00:00Z") },
		});
	});

	it("compares 7 days ending today with the 7 days before, cutting the last one at the same time of day", () => {
		const range = { fromDate: "2026-05-14", toDate: "2026-05-20", today: "2026-05-20" };
		const counterpartStart = seconds("2026-05-13T04:00:00Z");
		expect(planPreviousRangeQuery(range, "America/New_York", NOW_MS)).toEqual({
			rollupDates: ["2026-05-07", "2026-05-08", "2026-05-09", "2026-05-10", "2026-05-11", "2026-05-12"],
			rollupBounds: { from: "2026-05-07", to: "2026-05-12" },
			raw: { startSec: counterpartStart, endSec: counterpartStart + NOW_END_SEC - seconds("2026-05-20T04:00:00Z") },
		});
	});
});

describe("planHourlyWindow", () => {
	it("charts today in the Site's local hours up to the current hour", () => {
		const window = planHourlyWindow({ fromDate: "2026-05-21", toDate: "2026-05-21", today: "2026-05-21" }, "Asia/Kolkata", NOW_MS)!;
		expect(window.firstBucketSec).toBe(seconds("2026-05-20T18:30:00Z"));
		expect(window.buckets).toBe(6);
	});

	it("charts yesterday as 24 whole local hours", () => {
		expect(planHourlyWindow({ fromDate: "2026-05-19", toDate: "2026-05-19", today: "2026-05-20" }, "America/Los_Angeles", NOW_MS)).toEqual({
			startSec: seconds("2026-05-19T07:00:00Z"),
			endSec: seconds("2026-05-20T07:00:00Z"),
			firstBucketSec: seconds("2026-05-19T07:00:00Z"),
			buckets: 24,
		});
	});

	it("charts the last 24 hours in buckets aligned to the Site's local hours", () => {
		const window = planHourlyWindow({ fromDate: "2026-05-20", toDate: "2026-05-21", today: "2026-05-21", hours: 24 }, "Asia/Kolkata", NOW_MS)!;
		expect(window.startSec).toBe(NOW_END_SEC - 86_400);
		expect(window.firstBucketSec).toBe(seconds("2026-05-19T23:30:00Z"));
		expect(window.buckets).toBe(25);
	});

	it("charts longer Ranges by day", () => {
		expect(planHourlyWindow({ fromDate: "2026-05-14", toDate: "2026-05-20", today: "2026-05-20" }, "UTC", NOW_MS)).toBeNull();
	});
});

describe("date helpers", () => {
	it("lists every date in a Range, inclusive, across a month end", () => {
		expect(dateRangeList("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
	});

	it("shifts dates across a year end", () => {
		expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
	});

	it("recognises only known Range keys", () => {
		expect(isRangeKey("24h")).toBe(true);
		expect(isRangeKey("1y")).toBe(false);
	});
});

describe("rawWindowOfPlan", () => {
	it("spans the Rollup days and the raw window as one window", () => {
		const plan = planRangeQuery({ fromDate: "2026-05-15", toDate: "2026-05-21", today: "2026-05-21" }, "Asia/Tokyo", NOW_MS);
		expect(rawWindowOfPlan(plan, "Asia/Tokyo")).toEqual({ startSec: startOfDayUtcMs(plan.rollupBounds!.from, "Asia/Tokyo") / 1000, endSec: plan.raw!.endSec });
	});

	it("ends a Rollup-only plan at the end of its last day", () => {
		const plan = { rollupDates: ["2026-05-01", "2026-05-02"], rollupBounds: { from: "2026-05-01", to: "2026-05-02" }, raw: null };
		expect(rawWindowOfPlan(plan, "UTC")).toEqual({ startSec: seconds("2026-05-01T00:00:00Z"), endSec: seconds("2026-05-03T00:00:00Z") });
	});

	it("keeps a raw-only plan's window", () => {
		const raw = { startSec: 100, endSec: 200 };
		expect(rawWindowOfPlan({ rollupDates: [], rollupBounds: null, raw }, "UTC")).toEqual(raw);
	});

	it("ends the previous period of today at the same time of day", () => {
		const range = { fromDate: "2026-05-20", toDate: "2026-05-20", today: "2026-05-20" };
		const previous = planPreviousRangeQuery(range, "UTC", NOW_MS);
		expect(rawWindowOfPlan(previous, "UTC")).toEqual({ startSec: seconds("2026-05-19T00:00:00Z"), endSec: seconds("2026-05-19T23:30:00Z") + 1 });
	});
});

describe("daySegments", () => {
	it("is one segment for days without a DST switch", () => {
		expect(daySegments("2026-05-01", "2026-05-31", "Europe/Zurich")).toEqual([
			{ startSec: seconds("2026-04-30T22:00:00Z"), firstIndex: 0, uniform: true },
		]);
	});

	it("gives a DST switch day its own segment", () => {
		expect(daySegments("2026-10-24", "2026-10-27", "Europe/Zurich").map(segment => [segment.firstIndex, segment.uniform])).toEqual([
			[0, true],
			[1, false],
			[2, true],
		]);
	});

	it("starts each segment at its first day's local midnight", () => {
		const [, switchDay, after] = daySegments("2026-03-07", "2026-03-10", "America/New_York");
		expect(switchDay!.startSec).toBe(startOfDayUtcMs("2026-03-08", "America/New_York") / 1000);
		expect(after!.startSec).toBe(startOfDayUtcMs("2026-03-09", "America/New_York") / 1000);
	});
});
