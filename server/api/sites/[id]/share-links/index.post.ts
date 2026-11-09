import { createShareLink } from "#layers/core/server/db/queries/share-links";
import { createShareLinkSchema } from "#layers/core/shared/schemas/share-links";

export default defineEventHandler(async (event) => {
	const site = await requireSite(event, { shareLink: ["create"] });
	const parsed = createShareLinkSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	setResponseStatus(event, 201);
	return createShareLink(site.id, parsed.data);
});
