import type { ReportQuery } from "./dashboard-range";

export function journeyColumnTitle(step: number) {
	if (step === 0) {
		return "Starting point";
	}
	return `${step} ${step === 1 ? "step" : "steps"} after`;
}

// Clicking the selected node again unselects it, and with it every later column.
export function selectJourneyNode(path: string[], column: number, node: string) {
	const before = path.slice(0, column);
	return path[column] === node ? before : [...before, node];
}

export function journeyShare(visitors: number, columnVisitors: number) {
	return `${columnVisitors > 0 ? Math.round((visitors / columnVisitors) * 100) : 0}%`;
}

export function journeyQuery(reportQuery: ReportQuery, path: string[]): ReportQuery {
	return path.length > 0 ? { ...reportQuery, path } : { ...reportQuery };
}
