import { countGoals, createGoal } from "#layers/core/server/db/queries/goals";
import { createGoalSchema } from "#layers/core/shared/schemas/goals";
import { MAX_GOALS_PER_SITE } from "#layers/core/shared/utils/goals";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { goal: ["create"] });
	const parsed = createGoalSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	if (await countGoals(site.id) >= MAX_GOALS_PER_SITE) {
		throw createError({ statusCode: 400, statusMessage: "Too many Goals", message: `A site can have at most ${MAX_GOALS_PER_SITE} Goals.` });
	}
	const goal = await createGoal(site.id, parsed.data);
	if (!goal) {
		throw createError({ statusCode: 409, statusMessage: "Goal already exists", message: "This site already has that Goal." });
	}
	setResponseStatus(event, 201);
	return goal;
});
