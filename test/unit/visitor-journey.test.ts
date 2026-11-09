import { describe, expect, it } from "vitest";
import { formatClock, journeyPropEntries, sourceLabel, stepsOfVisit } from "#layers/core/app/utils/visitor-journey";
import type { JourneyStep } from "#layers/core/shared/types/analytics";

describe("sourceLabel", () => {
	it("names direct traffic, a referrer, or a UTM source without a referrer", () => {
		const source = { channel: "direct", referrerDomain: "(direct)", utmSource: null, utmMedium: null, utmCampaign: null };
		expect(sourceLabel(source)).toBe("Direct");
		expect(sourceLabel({ ...source, channel: "search", referrerDomain: "google.com" })).toBe("google.com");
		expect(sourceLabel({ ...source, channel: "email", utmSource: "newsletter" })).toBe("newsletter");
		expect(sourceLabel(null)).toBe("Unknown");
	});
});

describe("formatClock", () => {
	it("shows the time of day in the Site's timezone", () => {
		const noonUtc = Date.UTC(2026, 9, 9, 12, 5) / 1000;
		expect(formatClock(noonUtc, "UTC")).toBe("12:05");
		expect(formatClock(noonUtc, "Asia/Tokyo")).toBe("21:05");
	});
});

describe("stepsOfVisit", () => {
	const steps: JourneyStep[] = [
		{ type: "pageview", visitId: "a", timestamp: 1, path: "/", title: null, entry: true, timeOnPageSeconds: 5 },
		{ type: "outbound", visitId: null, timestamp: 2, url: "https://example.com" },
		{ type: "event", visitId: "b", timestamp: 3, name: "signup", path: "/", props: null },
	];

	it("keeps every step without a Visit chosen, and only that Visit's otherwise", () => {
		expect(stepsOfVisit(steps, null)).toHaveLength(3);
		expect(stepsOfVisit(steps, "b").map(step => step.type)).toEqual(["event"]);
	});
});

describe("journeyPropEntries", () => {
	it("turns an Event's properties into text pairs", () => {
		expect(journeyPropEntries({ plan: "pro", seats: 3, nested: { a: 1 } })).toEqual([["plan", "pro"], ["seats", "3"], ["nested", "{\"a\":1}"]]);
		expect(journeyPropEntries(null)).toEqual([]);
	});
});
