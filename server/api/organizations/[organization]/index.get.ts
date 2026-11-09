export default defineEventHandler(async (event) => {
	const { membership } = await requireOrganizationMember(event);
	return membership;
});
