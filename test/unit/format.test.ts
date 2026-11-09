import { describe, expect, it } from "vitest";
import { formatBytes, formatChange, formatCompactNumber, formatDuration, formatPercent, formatTimezoneOffset, percentChange } from "#layers/core/shared/utils/format";

describe("formatCompactNumber", () => {
	it("keeps small numbers whole", () => {
		expect(formatCompactNumber(999)).toBe("999");
	});

	it("abbreviates thousands to one decimal", () => {
		expect(formatCompactNumber(1250)).toBe("1.3K");
	});
});

describe("formatDuration", () => {
	it("formats seconds as m:ss", () => {
		expect(formatDuration(65)).toBe("1:05");
	});

	it("clamps negative durations to zero", () => {
		expect(formatDuration(-3)).toBe("0:00");
	});
});

describe("formatPercent", () => {
	it("formats a fraction with one decimal", () => {
		expect(formatPercent(0.4567)).toBe("45.7%");
	});
});

describe("formatTimezoneOffset", () => {
	it("names the offset in force on the given date", () => {
		expect(formatTimezoneOffset("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe("GMT+1");
		expect(formatTimezoneOffset("Europe/London", new Date("2026-01-01T12:00:00Z"))).toBe("GMT");
	});

	it("keeps half-hour offsets", () => {
		expect(formatTimezoneOffset("Asia/Kolkata", new Date("2026-01-01T12:00:00Z"))).toBe("GMT+5:30");
	});

	it("shows UTC as GMT", () => {
		expect(formatTimezoneOffset("UTC", new Date("2026-01-01T12:00:00Z"))).toBe("GMT");
	});
});

describe("percentChange", () => {
	it("is the change relative to the previous value", () => {
		expect(percentChange(150, 100)).toBeCloseTo(0.5);
		expect(percentChange(50, 200)).toBeCloseTo(-0.75);
	});

	it("is zero when both periods are empty", () => {
		expect(percentChange(0, 0)).toBe(0);
	});

	it("is null when only the previous period is empty", () => {
		expect(percentChange(5, 0)).toBeNull();
	});
});

describe("formatChange", () => {
	it("signs and rounds to a whole percent", () => {
		expect(formatChange(0.124)).toBe("+12%");
		expect(formatChange(-0.036)).toBe("-4%");
		expect(formatChange(0.001)).toBe("0%");
	});
});

describe("formatBytes", () => {
	it("uses binary units with one decimal above a kilobyte", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(16_384)).toBe("16.0 KB");
		expect(formatBytes(1.5 * 1024 ** 2)).toBe("1.5 MB");
		expect(formatBytes(7 * 1024 ** 3)).toBe("7.0 GB");
	});
});
