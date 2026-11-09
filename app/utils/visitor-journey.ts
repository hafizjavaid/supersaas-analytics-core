import type { JourneyStep, VisitorSource } from "#layers/core/shared/types/analytics";

export function sourceLabel(source: VisitorSource | null): string {
	if (!source) {
		return "Unknown";
	}
	if (source.referrerDomain !== "(direct)") {
		return source.referrerDomain;
	}
	return source.utmSource || "Direct";
}

export function formatClock(timestampSec: number, timezone: string): string {
	return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestampSec * 1000));
}

export function formatDay(timestampSec: number, timezone: string): string {
	return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(timestampSec * 1000));
}

export function stepsOfVisit(steps: JourneyStep[], visitId: string | null): JourneyStep[] {
	return visitId ? steps.filter(step => step.visitId === visitId) : steps;
}

export function journeyPropEntries(props: Record<string, unknown> | null): [string, string][] {
	return Object.entries(props ?? {}).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]);
}
