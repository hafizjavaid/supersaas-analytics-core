import { unlockShareLinkSchema } from "#layers/core/shared/schemas/share-links";

export default defineEventHandler(async (event) => {
	const parsed = unlockShareLinkSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	await unlockShareLink(event, parsed.data.password);
	setResponseStatus(event, 204);
	return null;
});
