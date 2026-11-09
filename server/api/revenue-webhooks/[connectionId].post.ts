import { getRevenueConnectionById, recordPayment } from "#layers/core/server/db/queries/revenue";

// Called by the Revenue provider, not a signed-in user: the signature proves the payload came from the Site's provider.
// Anything that is no Payment for this Site still answers 202, or the provider would keep retrying it.
export default defineEventHandler(async (event) => {
	const connection = await getRevenueConnectionById(getRouterParam(event, "connectionId") ?? "");
	if (!connection) {
		throw createError({ statusCode: 404, statusMessage: "Not found" });
	}
	const body = await readRawBody(event, "utf8") ?? "";
	const provider = revenueProviders[connection.provider];
	if (!await provider.verifyWebhook(body, new Headers(getHeaders(event) as Record<string, string>), connection.webhookSecret)) {
		throw createError({ statusCode: 401, statusMessage: "Invalid signature" });
	}
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	}
	catch {
		throw createError({ statusCode: 400, statusMessage: "Invalid JSON" });
	}
	const payment = provider.parsePayment(payload);
	if (payment) {
		await recordPayment(connection, payment);
	}
	setResponseStatus(event, 202);
	return null;
});
