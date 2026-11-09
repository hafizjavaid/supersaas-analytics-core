import type { Filter } from "./filters";
import { normalizePathRule } from "./traffic-exclusion";

export const GOAL_KINDS = ["event", "page", "outbound"] as const;

export type GoalKind = typeof GOAL_KINDS[number];

// `value` is an Event name, a page pattern where `*` matches any characters, or "" for any Outbound link.
export interface GoalDefinition {
	kind: GoalKind;
	value: string;
}

export const MAX_GOALS_PER_SITE = 50;
export const MAX_EVENT_NAME_LENGTH = 200;

export interface QuickGoal extends GoalDefinition {
	name: string;
	icon: string;
}

// Event names must match what sd.js sends for auto-captured clicks (ticket 05).
export const QUICK_GOALS: QuickGoal[] = [
	{ name: "WhatsApp leads", kind: "event", value: "WhatsApp click", icon: "i-simple-icons-whatsapp" },
	{ name: "Phone clicks", kind: "event", value: "Phone click", icon: "i-material-symbols-call-outline-rounded" },
	{ name: "Email clicks", kind: "event", value: "Email click", icon: "i-material-symbols-mail-outline-rounded" },
	{ name: "Form submits", kind: "event", value: "Form submit", icon: "i-material-symbols-edit-note-outline-rounded" },
	{ name: "Outbound clicks", kind: "outbound", value: "", icon: "i-material-symbols-open-in-new-rounded" },
];

export function isGoalKind(value: unknown): value is GoalKind {
	return GOAL_KINDS.includes(value as GoalKind);
}

export function normalizeGoalValue(kind: GoalKind, value: string): string | null {
	const trimmed = value.trim();
	switch (kind) {
		case "event":
			return trimmed && trimmed.length <= MAX_EVENT_NAME_LENGTH ? trimmed : null;
		case "page":
			return normalizePathRule(trimmed);
		case "outbound":
			return trimmed ? null : "";
	}
}

export function sameGoal(a: GoalDefinition, b: GoalDefinition) {
	return a.kind === b.kind && a.value === b.value;
}

export function goalFilter(goal: GoalDefinition): Filter {
	return { dimension: "goal", value: goal.kind === "outbound" ? "outbound" : `${goal.kind}:${goal.value}` };
}

export function parseGoalFilterValue(value: string): GoalDefinition | null {
	const separator = value.indexOf(":");
	const kind = separator === -1 ? value : value.slice(0, separator);
	const rest = separator === -1 ? "" : value.slice(separator + 1);
	if (!isGoalKind(kind) || (kind === "outbound" && separator !== -1)) {
		return null;
	}
	const normalized = normalizeGoalValue(kind, rest);
	return normalized === rest ? { kind, value: normalized } : null;
}

// SQLite's GLOB also treats `?` and `[` as wildcards; a Goal pattern only means `*`.
export function goalGlob(pattern: string): string {
	return pattern.replace(/[[?]/g, character => `[${character}]`);
}

export function describeGoal(goal: GoalDefinition): string {
	switch (goal.kind) {
		case "event":
			return goal.value;
		case "page":
			return `Visited ${goal.value}`;
		case "outbound":
			return "Outbound link clicks";
	}
}
