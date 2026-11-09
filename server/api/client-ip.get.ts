export default defineEventHandler(async (event) => {
	await requireUserSession(event);
	return { ip: getClientIp(event) };
});
