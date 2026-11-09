import { listUsersForAdmin } from "#layers/core/server/db/queries/admin";
import { adminUsersQuerySchema } from "#layers/core/shared/schemas/admin";

export default defineEventHandler(async (event) => {
	await requireAdminSession(event);
	const parsed = adminUsersQuerySchema.safeParse(getQuery(event));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	return listUsersForAdmin(parsed.data);
});
