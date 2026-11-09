import { listOrganizationsForAdmin } from "#layers/core/server/db/queries/admin";

export default defineEventHandler(async (event) => {
	await requireAdminSession(event);
	return listOrganizationsForAdmin();
});
