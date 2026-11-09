import { pathMatchesAnyRule } from "./traffic-exclusion";

export const FUNNEL_WINDOWS = ["1h", "24h", "7d", "30d"] as const;
export type FunnelWindow = typeof FUNNEL_WINDOWS[number];

export const FUNNEL_WINDOW_SECONDS: Record<FunnelWindow, number> = {
	"1h": 3600,
	"24h": 86_400,
	"7d": 7 * 86_400,
	"30d": 30 * 86_400,
};

export const FUNNEL_WINDOW_LABELS: Record<FunnelWindow, string> = {
	"1h": "1 hour",
	"24h": "24 hours",
	"7d": "7 days",
	"30d": "30 days",
};

export const FUNNEL_STEP_KINDS = ["page", "event"] as const;
export type FunnelStepKind = typeof FUNNEL_STEP_KINDS[number];

export const MIN_FUNNEL_STEPS = 2;
export const MAX_FUNNEL_STEPS = 8;
export const MAX_FUNNELS_PER_SITE = 20;

// `value` is a page pattern where `*` matches any characters, or an Event name. An empty label shows the value.
export interface FunnelStep {
	kind: FunnelStepKind;
	value: string;
	label: string;
}

export interface FunnelDefinition {
	name: string;
	window: FunnelWindow;
	steps: FunnelStep[];
}

// One matching Pageview or Event of a person. Only a hit in a Visit inside the Range and Filters can enter the Funnel.
export interface FunnelHit {
	timestamp: number;
	kind: FunnelStepKind;
	value: string;
	canEnter: boolean;
}

export interface FunnelStepResult {
	step: FunnelStep;
	label: string;
	visitors: number;
	entryRate: number;
	// Both compare with the step before, so the first step has none.
	continueRate: number | null;
	dropped: number;
}

export interface FunnelReport {
	visitors: number;
	entered: number;
	completed: number;
	conversionRate: number;
	enteredRate: number;
	steps: FunnelStepResult[];
}

export function describeFunnelStep(step: FunnelStep): string {
	return step.label || step.value;
}

export function stepMatches(step: FunnelStep, hit: Pick<FunnelHit, "kind" | "value">): boolean {
	if (step.kind !== hit.kind) {
		return false;
	}
	return step.kind === "page" ? pathMatchesAnyRule(hit.value, [step.value]) : step.value === hit.value;
}

const KIND_ORDER: Record<FunnelStepKind, number> = { page: 0, event: 1 };

// An Event fires on the page that was just viewed, so a Pageview sorts before an Event of the same second.
function inTimeOrder(hits: FunnelHit[]) {
	return hits.toSorted((a, b) => a.timestamp - b.timestamp || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

// How many steps one person completed in order within the window of their entry. Each entry is tried, because an
// early entry can run out of time where a later one does not.
export function funnelDepth(steps: FunnelStep[], windowSec: number, hits: FunnelHit[]): number {
	const sorted = inTimeOrder(hits);
	let best = 0;
	for (const [start, entry] of sorted.entries()) {
		if (!entry.canEnter || !stepMatches(steps[0]!, entry)) {
			continue;
		}
		let depth = 1;
		const deadline = entry.timestamp + windowSec;
		for (const hit of sorted.slice(start + 1)) {
			if (depth === steps.length || hit.timestamp > deadline) {
				break;
			}
			if (stepMatches(steps[depth]!, hit)) {
				depth += 1;
			}
		}
		best = Math.max(best, depth);
		if (best === steps.length) {
			break;
		}
	}
	return best;
}

const share = (part: number, whole: number) => whole > 0 ? part / whole : 0;

export function summarizeFunnel(steps: FunnelStep[], depths: number[], visitors: number): FunnelReport {
	const reached = steps.map((_, index) => depths.filter(depth => depth > index).length);
	const entered = reached[0] ?? 0;
	const completed = reached.at(-1) ?? 0;
	return {
		visitors,
		entered,
		completed,
		conversionRate: share(completed, entered),
		enteredRate: share(entered, visitors),
		steps: steps.map((step, index) => {
			const previous = index === 0 ? null : reached[index - 1]!;
			return {
				step,
				label: describeFunnelStep(step),
				visitors: reached[index]!,
				entryRate: share(reached[index]!, entered),
				continueRate: previous === null ? null : share(reached[index]!, previous),
				dropped: previous === null ? 0 : previous - reached[index]!,
			};
		}),
	};
}
