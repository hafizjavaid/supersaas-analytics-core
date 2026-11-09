import { databaseSizeBytes } from "#layers/core/server/db/queries/admin";

export default defineEventHandler(async (event) => {
	await requireAdminSession(event);
	return databaseSizeReport(await databaseSizeBytes());
});
