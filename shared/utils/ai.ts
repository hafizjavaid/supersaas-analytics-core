import type { ResolvedRange } from "./dates";

export function aiQuestionLimitMessage(limit: number) {
	return `This Organization has asked its ${limit} questions this month. Ask AI opens again on the 1st.`;
}

export type AiScope = "site" | "organization";

// A null `limit` is unlimited, as on a Self-hosted copy.
export interface AiAllowance {
	used: number;
	limit: number | null;
	left: number | null;
}

const TITLE_LENGTH = 60;

export function conversationTitle(question: string): string {
	const oneLine = question.replace(/\s+/g, " ").trim();
	if (oneLine.length <= TITLE_LENGTH) {
		return oneLine;
	}
	const cut = oneLine.slice(0, TITLE_LENGTH);
	return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : TITLE_LENGTH).trimEnd()}…`;
}

const STARTER_QUESTIONS: Record<AiScope, string[]> = {
	site: [
		"How did traffic change over the last 30 days?",
		"Where do my visitors come from this week?",
		"Which pages are visited most, and which do visitors leave from?",
		"How are my Goals converting?",
	],
	organization: [
		"Which of my sites grew the most this month?",
		"Compare visitors across all my sites over the last 7 days.",
		"Which countries bring the most visitors to my sites?",
		"What changed most since last week?",
	],
};

export function starterQuestions(scope: AiScope): string[] {
	return STARTER_QUESTIONS[scope];
}

export const TOP_LIST_DIMENSIONS = [
	"page",
	"entry_page",
	"exit_page",
	"outbound_link",
	"channel",
	"referrer",
	"ai_assistant",
	"utm_campaign",
	"utm_medium",
	"utm_term",
	"utm_content",
	"browser",
	"os",
	"device",
	"country",
	"region",
	"city",
	"event",
] as const;

export type TopListDimension = typeof TOP_LIST_DIMENSIONS[number];

export interface TopListOutput {
	range: ResolvedRange;
	dimension: TopListDimension;
	metric: "pageviews" | "visits" | "clicks" | "events";
	rows: { label: string; value: number }[];
	total: number;
}

// What each report gives, worded once for Ask AI's tools and the MCP tools.
export const REPORT_DESCRIPTIONS = {
	listSites: "List the Organization's Sites with their ids, domains and timezones.",
	summary: "Visitors, Visits, Pageviews, bounce rate and visit duration (with conversion rate and Revenue once set up) over a Range, and the same for the previous period.",
	timeseries: "Visitors and Pageviews over a Range, per hour for a single day and per day otherwise.",
	topList: "The top values of one dimension over a Range, such as pages, referrers, channels, countries or browsers.",
	goals: "Each Goal's conversions, unique Visitors and conversion rate over a Range.",
	payments: "Revenue, Payments, average order value and time to convert over a Range, with Revenue by Source and country. Amounts are in the currency's minor unit, such as cents. Only for Sites with a Revenue connection.",
} as const;
