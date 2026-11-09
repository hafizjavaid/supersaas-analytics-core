import { describe, expect, it } from "vitest";
import { digestFigureRows, digestPeriodEnding, formatDateSpan, digestPeriodLabel, previousDigestPeriod, topMovers } from "#layers/core/shared/utils/digests";

describe("digestPeriodEnding", () => {
	it("covers the one day for a daily Digest", () => {
		expect(digestPeriodEnding("daily", "2026-10-07")).toEqual({ fromDate: "2026-10-07", toDate: "2026-10-07" });
	});

	it("covers Monday to Sunday for a weekly Digest, and only on a Sunday", () => {
		expect(digestPeriodEnding("weekly", "2026-10-11")).toEqual({ fromDate: "2026-10-05", toDate: "2026-10-11" });
		expect(digestPeriodEnding("weekly", "2026-10-10")).toBeNull();
	});

	it("covers the calendar month for a monthly Digest, and only on its last day", () => {
		expect(digestPeriodEnding("monthly", "2026-09-30")).toEqual({ fromDate: "2026-09-01", toDate: "2026-09-30" });
		expect(digestPeriodEnding("monthly", "2028-02-29")).toEqual({ fromDate: "2028-02-01", toDate: "2028-02-29" });
		expect(digestPeriodEnding("monthly", "2026-09-29")).toBeNull();
	});
});

describe("previousDigestPeriod", () => {
	it("is the span of equal length just before", () => {
		expect(previousDigestPeriod({ fromDate: "2026-10-05", toDate: "2026-10-11" })).toEqual({ fromDate: "2026-09-28", toDate: "2026-10-04" });
		expect(previousDigestPeriod({ fromDate: "2026-09-01", toDate: "2026-09-30" })).toEqual({ fromDate: "2026-08-02", toDate: "2026-08-31" });
	});
});

describe("digestPeriodLabel", () => {
	it("names the day, the week or the month", () => {
		expect(digestPeriodLabel("daily", { fromDate: "2026-10-07", toDate: "2026-10-07" })).toBe("Wednesday, October 7, 2026");
		expect(digestPeriodLabel("weekly", { fromDate: "2026-09-28", toDate: "2026-10-04" })).toBe("September 28 – October 4, 2026");
		expect(digestPeriodLabel("monthly", { fromDate: "2026-09-01", toDate: "2026-09-30" })).toBe("September 2026");
	});
});

describe("formatDateSpan", () => {
	it("names one day once, and the year once when both ends share it", () => {
		expect(formatDateSpan({ fromDate: "2026-10-06", toDate: "2026-10-06" })).toBe("October 6, 2026");
		expect(formatDateSpan({ fromDate: "2026-12-28", toDate: "2027-01-03" })).toBe("December 28, 2026 – January 3, 2027");
	});
});

describe("topMovers", () => {
	it("ranks by the size of the change, rises and falls alike, and leaves out the unchanged", () => {
		const current = [{ label: "/", count: 100 }, { label: "/pricing", count: 10 }, { label: "/new", count: 30 }, { label: "/same", count: 5 }];
		const previous = [{ label: "/", count: 80 }, { label: "/pricing", count: 50 }, { label: "/same", count: 5 }];
		expect(topMovers(current, previous)).toEqual([
			{ label: "/pricing", current: 10, previous: 50 },
			{ label: "/new", current: 30, previous: 0 },
			{ label: "/", current: 100, previous: 80 },
		]);
	});

	it("keeps the first few", () => {
		const current = Array.from({ length: 8 }, (_, index) => ({ label: `/${index}`, count: index + 1 }));
		expect(topMovers(current, [], 3).map(mover => mover.label)).toEqual(["/7", "/6", "/5"]);
	});
});

describe("digestFigureRows", () => {
	const figure = (current: number, previous: number) => ({ current, previous });
	const figures = {
		visitors: figure(1200, 1000),
		visits: figure(1500, 1500),
		pageviews: figure(4000, 0),
		bounceRate: figure(0.5, 0.4),
		avgDurationSeconds: figure(90, 120),
	};

	it("formats each key figure with its change, and whether the change is good news", () => {
		expect(digestFigureRows({ ...figures, conversionRate: null, revenue: null }, null)).toEqual([
			{ label: "Visitors", current: "1,200", previous: "1,000", change: "+20%", improved: true },
			{ label: "Visits", current: "1,500", previous: "1,500", change: "0%", improved: null },
			{ label: "Pageviews", current: "4,000", previous: "0", change: null, improved: null },
			{ label: "Bounce rate", current: "50.0%", previous: "40.0%", change: "+25%", improved: false },
			{ label: "Visit duration", current: "1:30", previous: "2:00", change: "-25%", improved: false },
		]);
	});

	it("adds Conversion rate and Revenue once the Site has them", () => {
		const rows = digestFigureRows({ ...figures, conversionRate: figure(0.02, 0.01), revenue: figure(12_000, 15_000) }, "usd");
		expect(rows.slice(-2)).toEqual([
			{ label: "Conversion rate", current: "2.0%", previous: "1.0%", change: "+100%", improved: true },
			{ label: "Revenue", current: "$120", previous: "$150", change: "-20%", improved: false },
		]);
	});
});
