import { saveDigestSubscription } from "#layers/core/server/db/queries/digests";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { digestSubscriptionSchema } from "#layers/core/shared/schemas/digests";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	const site = await getSiteById(getRouterParam(event, "siteId") ?? "");
	if (!site || site.organizationId !== membership.id) {
		throw createError({ statusCode: 404, statusMessage: "Site not found" });
	}
	const parsed = digestSubscriptionSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	await saveDigestSubscription(membership.memberId, site.id, parsed.data.frequency);
	return { siteId: site.id, frequency: parsed.data.frequency };
});
