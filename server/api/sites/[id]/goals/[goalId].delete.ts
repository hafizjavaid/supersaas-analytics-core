import { deleteGoal } from "#layers/core/server/db/queries/goals";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { goal: ["delete"] });
	if (!await deleteGoal(site.id, getRouterParam(event, "goalId") ?? "")) {
		throw createError({ statusCode: 404, statusMessage: "Goal not found" });
	}
	setResponseStatus(event, 204);
	return null;
});
