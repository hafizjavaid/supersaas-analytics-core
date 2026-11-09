import { createSite, isDomainTaken } from "#layers/core/server/db/queries/sites";
import { createSiteSchema } from "#layers/core/shared/schemas/sites";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationPermission(event, { site: ["create"] });
	const parsed = createSiteSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	if (await isDomainTaken(membership.id, parsed.data.domain)) {
		throw domainTakenError(parsed.data.domain);
	}
	await serverEdition().assertDomainAvailable(membership, parsed.data.domain);
	setResponseStatus(event, 201);
	return createSite(membership.id, parsed.data);
});
