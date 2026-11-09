import { findMember, transferOwnership } from "#layers/core/server/db/queries/organizations";
import { transferOwnershipSchema } from "#layers/core/shared/schemas/organizations";

export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationPermission(event, { ownership: ["transfer"] });
	const parsed = transferOwnershipSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const newOwner = await findMember(membership.id, parsed.data.memberId);
	if (!newOwner || newOwner.id !== parsed.data.memberId) {
		throw createError({ statusCode: 404, statusMessage: "Member not found" });
	}
	if (newOwner.id === membership.memberId) {
		throw createError({ statusCode: 400, statusMessage: "You are already the Owner" });
	}
	await transferOwnership(membership.id, membership.memberId, newOwner.id);
	setResponseStatus(event, 204);
	return null;
});
