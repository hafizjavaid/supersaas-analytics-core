import { listMemberships } from "#layers/core/server/db/queries/organizations";

export default defineEventHandler(async (event) => {
	const { user } = await requireUserSession(event);
	return listMemberships(user.id);
});
