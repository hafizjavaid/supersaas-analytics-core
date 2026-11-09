import { describe, expect, it } from "vitest";
import { aiQuestionLimitMessage, conversationTitle, starterQuestions } from "#layers/core/shared/utils/ai";

describe("conversationTitle", () => {
	it("is the first question, on one line and cut at a word", () => {
		expect(conversationTitle("Where did\nmy visitors come from last week?")).toBe("Where did my visitors come from last week?");
		const long = conversationTitle("Which pages brought the most visitors from Google in the last ninety days compared with the period before?");
		expect(long.length).toBeLessThanOrEqual(61);
		expect(long.endsWith("…")).toBe(true);
	});
});

describe("aiQuestionLimitMessage", () => {
	it("names the Tier's number", () => {
		expect(aiQuestionLimitMessage(200)).toBe("This Organization has asked its 200 questions this month. Ask AI opens again on the 1st.");
	});
});

describe("starterQuestions", () => {
	it("asks about one Site on a Site and compares Sites on the Organization", () => {
		expect(starterQuestions("site").length).toBeGreaterThanOrEqual(3);
		expect(starterQuestions("organization").some(question => /sites/i.test(question))).toBe(true);
	});
});
