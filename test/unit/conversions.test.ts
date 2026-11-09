import { describe, expect, it } from "vitest";
import { formatTimeToConvert, paymentHeadline } from "#layers/core/app/utils/conversions";

describe("formatTimeToConvert", () => {
	it("reads in the largest whole unit", () => {
		expect(formatTimeToConvert(20)).toBe("under 1 min");
		expect(formatTimeToConvert(65)).toBe("1 min");
		expect(formatTimeToConvert(3 * 3600 + 120)).toBe("3 h");
		expect(formatTimeToConvert(86_400)).toBe("1 day");
		expect(formatTimeToConvert(5 * 86_400)).toBe("5 days");
	});

	it("shows a dash when the payer's first visit is unknown", () => {
		expect(formatTimeToConvert(null)).toBe("–");
	});
});

describe("paymentHeadline", () => {
	it("tells the amount and how long after the first visit it came", () => {
		expect(paymentHeadline({ amount: 4900, currency: "usd", timeToConvertSeconds: 70 })).toBe("$49 · converted 1 min after first visit");
		expect(paymentHeadline({ amount: 4900, currency: "usd", timeToConvertSeconds: 10 })).toBe("$49 · converted under 1 min after first visit");
		expect(paymentHeadline({ amount: 4900, currency: "usd", timeToConvertSeconds: null })).toBe("$49");
	});
});
