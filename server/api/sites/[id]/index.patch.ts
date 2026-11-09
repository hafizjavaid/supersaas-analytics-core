import { isDomainTaken, updateSite } from "#layers/core/server/db/queries/sites";
import { updateSiteSchema } from "#layers/core/shared/schemas/sites";

export default defineEventHandler(async (event) => {
	const { site, membership } = await requireSiteMembership(event, { site: ["update"] });
	const parsed = updateSiteSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	if (parsed.data.domain && await isDomainTaken(site.organizationId, parsed.data.domain, site.id)) {
		throw domainTakenError(parsed.data.domain);
	}
	if (parsed.data.domain) {
		await serverEdition().assertDomainAvailable(membership, parsed.data.domain, site.domain);
	}
	return updateSite(site.id, parsed.data);
});
