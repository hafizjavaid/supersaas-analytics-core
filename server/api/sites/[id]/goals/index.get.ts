import { listGoals } from "#layers/core/server/db/queries/goals";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event);
	return listGoals(site.id);
});
