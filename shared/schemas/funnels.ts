import { z } from "zod";
import { FUNNEL_STEP_KINDS, FUNNEL_WINDOWS, MAX_FUNNEL_STEPS, MIN_FUNNEL_STEPS } from "../utils/funnels";
import { normalizeGoalValue } from "../utils/goals";

export const funnelStepSchema = z.object({
	kind: z.enum(FUNNEL_STEP_KINDS),
	value: z.string().max(500),
	label: z.string().trim().max(60).default(""),
}).transform((input, context) => {
	const value = normalizeGoalValue(input.kind, input.value);
	if (value === null) {
		context.addIssue({ code: "custom", message: input.kind === "page" ? "Start the page pattern with /" : "Enter an Event name", path: ["value"] });
		return z.NEVER;
	}
	return { kind: input.kind, value, label: input.label };
});

export const funnelSchema = z.object({
	name: z.string().trim().min(1, "Enter a name").max(100),
	window: z.enum(FUNNEL_WINDOWS).default("24h"),
	steps: z.array(funnelStepSchema)
		.min(MIN_FUNNEL_STEPS, `A Funnel needs at least ${MIN_FUNNEL_STEPS} steps`)
		.max(MAX_FUNNEL_STEPS, `A Funnel has at most ${MAX_FUNNEL_STEPS} steps`),
});

export type FunnelInput = z.infer<typeof funnelSchema>;
