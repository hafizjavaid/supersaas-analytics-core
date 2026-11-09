import type { TimeseriesPoint } from "#layers/core/shared/types/analytics";
import type { TopListDimension, TopListOutput } from "#layers/core/shared/utils/ai";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";

export interface ToolPart {
	type: string;
	state: string;
	output?: unknown;
	errorText?: string;
}

export type ToolPartView
	= | { kind: "pending" | "done" | "error"; label: string }
		| { kind: "timeseries"; label: string; points: Pick<TimeseriesPoint, "timestamp" | "visitors" | "pageviews">[]; hourly: boolean }
		| { kind: "topList"; label: string; metric: TopListOutput["metric"]; rows: { key: string; label: string; value: number }[]; total: number };

const TOOL_LABELS: Record<string, { running: string; done: string; failed: string }> = {
	listSites: { running: "Listing sites…", done: "Listed the sites", failed: "Could not list the sites" },
	summary: { running: "Reading the summary…", done: "Read the summary", failed: "Could not read the summary" },
	timeseries: { running: "Charting traffic…", done: "Charted traffic", failed: "Could not chart traffic" },
	topList: { running: "Ranking…", done: "Ranked", failed: "Could not rank" },
	funnel: { running: "Reading Funnels…", done: "Read Funnels", failed: "Could not read Funnels" },
	goals: { running: "Reading Goals…", done: "Read Goals", failed: "Could not read Goals" },
	payments: { running: "Reading Payments…", done: "Read Payments", failed: "Could not read Payments" },
};

const DIMENSION_LABELS: Record<TopListDimension, string> = {
	page: "pages",
	entry_page: "entry pages",
	exit_page: "exit pages",
	outbound_link: "outbound links",
	channel: "channels",
	referrer: "referrers",
	ai_assistant: "AI assistants",
	utm_campaign: "campaigns",
	utm_medium: "mediums",
	utm_term: "terms",
	utm_content: "contents",
	browser: "browsers",
	os: "operating systems",
	device: "devices",
	country: "countries",
	region: "regions",
	city: "cities",
	event: "Events",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function toolPartView(part: ToolPart): ToolPartView {
	const name = part.type.replace(/^tool-/, "");
	const labels = TOOL_LABELS[name] ?? { running: "Reading…", done: "Read", failed: "Could not read" };
	if (part.state === "output-error") {
		return { kind: "error", label: labels.failed };
	}
	if (part.state !== "output-available" || !isRecord(part.output)) {
		return { kind: "pending", label: labels.running };
	}
	const output = part.output;
	if (typeof output.error === "string") {
		return { kind: "error", label: output.error };
	}
	if (name === "timeseries" && Array.isArray(output.points)) {
		const range = output.range as ResolvedRange;
		return { kind: "timeseries", label: `Traffic on ${output.site}`, points: output.points, hourly: !!range.hours || range.fromDate === range.toDate };
	}
	if (name === "topList" && Array.isArray(output.rows)) {
		const result = output as unknown as TopListOutput & { site: string };
		return {
			kind: "topList",
			label: `Top ${DIMENSION_LABELS[result.dimension]} on ${result.site}`,
			metric: result.metric,
			rows: result.rows.map(row => ({ key: row.label, ...row })),
			total: result.total,
		};
	}
	return { kind: "done", label: labels.done };
}
