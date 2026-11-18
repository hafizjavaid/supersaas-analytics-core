import type { Funnels, FunnelReport, Goals, Live, ReportRange, SiteRef, Sites, Summary, Totals, TopList } from "./api-types.js";

const COLUMN_GAP = "  ";

interface Column {
	title: string;
	numeric?: boolean;
}

function numeric(title: string): Column {
	return { title, numeric: true };
}

export function formatTable(columns: (string | Column)[], rows: string[][]) {
	const specs = columns.map(column => typeof column === "string" ? { title: column } : column);
	const lines = [specs.map(spec => spec.title), ...rows];
	const widths = specs.map((_, index) => Math.max(...lines.map(line => (line[index] ?? "").length)));
	return lines
		.map(line => line
			.map((cell, index) => specs[index]!.numeric ? cell.padStart(widths[index]!) : cell.padEnd(widths[index]!))
			.join(COLUMN_GAP)
			.trimEnd())
		.join("\n");
}

export function formatCount(value: number) {
	return value.toLocaleString("en-US");
}

export function formatPercent(share: number) {
	const percent = share * 100;
	const rounded = percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
	return `${rounded}%`;
}

export function formatDuration(seconds: number) {
	const whole = Math.round(seconds);
	if (whole < 60) {
		return `${whole}s`;
	}
	const minutes = Math.floor(whole / 60);
	return minutes < 60 ? `${minutes}m ${whole % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatMoney(minorUnits: number, currency: string) {
	const format = new Intl.NumberFormat("en-US", { style: "currency", currency });
	const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
	return format.format(minorUnits / 10 ** digits);
}

function formatRange(range: ReportRange) {
	if (range.hours !== null) {
		return `last ${range.hours} hours`;
	}
	return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
}

function siteLabel(site: SiteRef) {
	return `${site.name} (${site.domain})`;
}

function heading(site: SiteRef, range: ReportRange) {
	return `${siteLabel(site)}, ${formatRange(range)}`;
}

function relativeChange(current: number, previous: number) {
	if (previous === 0) {
		return current === 0 ? "0%" : "new";
	}
	const change = Math.round((current - previous) / previous * 100);
	return `${change > 0 ? "+" : ""}${change}%`;
}

function pointChange(current: number, previous: number) {
	const points = Math.round((current - previous) * 1000) / 10;
	return `${points > 0 ? "+" : ""}${points} pts`;
}

export function formatSites({ sites }: Sites) {
	if (sites.length === 0) {
		return "No Sites yet. Add one in the dashboard.";
	}
	return formatTable(["ID", "Name", "Domain", "Timezone"], sites.map(site => [site.id, site.name, site.domain, site.timezone]));
}

export function formatSummary(summary: Summary) {
	const { current, previous } = summary;
	const count = (label: string, key: "visitors" | "visits" | "pageviews") =>
		[label, formatCount(current[key]), formatCount(previous[key]), relativeChange(current[key], previous[key])];
	const rows = [
		count("Visitors", "visitors"),
		count("Visits", "visits"),
		count("Pageviews", "pageviews"),
		["Bounce rate", formatPercent(current.bounceRate), formatPercent(previous.bounceRate), pointChange(current.bounceRate, previous.bounceRate)],
		["Avg visit duration", formatDuration(current.avgVisitDurationSeconds), formatDuration(previous.avgVisitDurationSeconds), relativeChange(current.avgVisitDurationSeconds, previous.avgVisitDurationSeconds)],
	];
	if (current.conversionRate !== null) {
		const before = previous.conversionRate ?? 0;
		rows.push(["Conversion rate", formatPercent(current.conversionRate), formatPercent(before), pointChange(current.conversionRate, before)]);
	}
	if (current.revenue !== null && summary.currency) {
		rows.push(revenueRow(current, previous, summary.currency));
	}
	return `${heading(summary.site, summary.range)}\n\n${formatTable(["Metric", numeric("Value"), numeric("Previous"), numeric("Change")], rows)}`;
}

function revenueRow(current: Totals, previous: Totals, currency: string) {
	const now = current.revenue ?? 0;
	const before = previous.revenue ?? 0;
	return ["Revenue", formatMoney(now, currency), formatMoney(before, currency), relativeChange(now, before)];
}

function columnTitle(name: string) {
	const words = name.replace(/_/g, " ");
	return (words[0]!.toUpperCase() + words.slice(1)).replace(/^Utm\b/, "UTM").replace(/^Ai\b/, "AI");
}

export function formatTopList(topList: TopList) {
	const title = heading(topList.site, topList.range);
	if (topList.rows.length === 0) {
		return `${title}\n\nNo data in this Range.`;
	}
	const rows = topList.rows.map(row => [row.label, formatCount(row.value), topList.total > 0 ? formatPercent(row.value / topList.total) : "-"]);
	return `${title}\n\n${formatTable([columnTitle(topList.dimension), numeric(columnTitle(topList.metric)), numeric("Share")], rows)}`;
}

export function formatLive(live: Live[]) {
	const rows = live.map(entry => [entry.site.name, entry.site.domain, formatCount(entry.visitors)]);
	if (live.length > 1) {
		rows.push(["Total", "", formatCount(live.reduce((sum, entry) => sum + entry.visitors, 0))]);
	}
	return formatTable(["Site", "Domain", numeric("Live visitors")], rows);
}

export function formatGoals(report: Goals) {
	const title = heading(report.site, report.range);
	if (report.goals.length === 0) {
		return `${title}\n\nNo Goals on this Site. Add them in Site Settings → Attribution.`;
	}
	const rows = report.goals.map(goal => [goal.name, formatCount(goal.conversions), formatCount(goal.visitors), formatPercent(goal.conversionRate)]);
	const overall = `${formatCount(report.converted)} of ${formatCount(report.visitors)} Visitors completed a Goal (${formatPercent(report.conversionRate)}).`;
	return `${title}\n\n${formatTable(["Goal", numeric("Conversions"), numeric("Visitors"), numeric("Rate")], rows)}\n\n${overall}`;
}

export function formatFunnels({ site, funnels }: Funnels) {
	if (funnels.length === 0) {
		return `${siteLabel(site)}\n\nNo Funnels on this Site. Build one on the dashboard's Funnels page.`;
	}
	const rows = funnels.map(funnel => [funnel.id, funnel.name, funnel.window, funnel.steps.map(step => step.label || step.value).join(" > ")]);
	return `${siteLabel(site)}\n\n${formatTable(["ID", "Name", "Window", "Steps"], rows)}`;
}

export function formatFunnelReport(report: FunnelReport) {
	const title = `${report.funnel.name} (${report.funnel.window} window), ${heading(report.site, report.range)}`;
	const rows = report.steps.map(step => [
		step.label,
		formatCount(step.visitors),
		step.continueRate === null ? "-" : formatPercent(step.continueRate),
		formatCount(step.dropped),
	]);
	const overall = `${formatCount(report.entered)} of ${formatCount(report.visitors)} Visitors entered (${formatPercent(report.enteredRate)}), `
		+ `${formatCount(report.completed)} completed (${formatPercent(report.conversionRate)}).`;
	return `${title}\n\n${formatTable(["Step", numeric("Visitors"), numeric("Continued"), numeric("Dropped")], rows)}\n\n${overall}`;
}

export function formatSnippet(baseUrl: string, siteId: string) {
	return `<script defer data-site="${siteId}" src="${baseUrl.replace(/\/+$/, "")}/sd.js"></script>`;
}
