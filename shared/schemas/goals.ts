import { z } from "zod";
import { describeGoal, GOAL_KINDS, normalizeGoalValue } from "../utils/goals";

export const createGoalSchema = z.object({
	kind: z.enum(GOAL_KINDS),
	value: z.string().max(500).default(""),
	name: z.string().trim().max(100).optional(),
}).transform((input, context) => {
	const value = normalizeGoalValue(input.kind, input.value);
	if (value === null) {
		const messages = { event: "Enter an Event name", page: "Start the page pattern with /", outbound: "An Outbound link Goal takes no value" };
		context.addIssue({ code: "custom", message: messages[input.kind], path: ["value"] });
		return z.NEVER;
	}
	const goal = { kind: input.kind, value };
	return { ...goal, name: input.name || describeGoal(goal) };
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
