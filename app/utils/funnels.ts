import type { FunnelDefinition, FunnelReport, FunnelStepResult, FunnelWindow } from "#layers/core/shared/utils/funnels";
import { FUNNEL_WINDOW_LABELS, MIN_FUNNEL_STEPS } from "#layers/core/shared/utils/funnels";
import { normalizeGoalValue } from "#layers/core/shared/utils/goals";
import { formatPercent } from "#layers/core/shared/utils/format";

export function funnelWindowLabel(window: FunnelWindow) {
	return `${FUNNEL_WINDOW_LABELS[window]} window`;
}

export function funnelEntryLine(report: Pick<FunnelReport, "steps" | "enteredRate">) {
	return `${report.steps.length} steps · ${formatPercent(report.enteredRate)} of all visitors entered`;
}

export function funnelTransition(step: Pick<FunnelStepResult, "continueRate" | "dropped">) {
	return `↓ ${formatPercent(step.continueRate ?? 0)} continue · ${step.dropped.toLocaleString("en-US")} dropped`;
}

// The builder previews only a draft the server would accept, so half-typed steps send no request.
export function previewableDraft(draft: FunnelDefinition): FunnelDefinition | null {
	if (draft.steps.length < MIN_FUNNEL_STEPS) {
		return null;
	}
	const steps = draft.steps.map(step => ({ ...step, value: normalizeGoalValue(step.kind, step.value) }));
	if (steps.some(step => step.value === null)) {
		return null;
	}
	return { name: draft.name.trim() || "Preview", window: draft.window, steps: steps.map(step => ({ ...step, value: step.value!, label: step.label.trim() })) };
}
