import { saveDigestSubscription } from "#layers/core/server/db/queries/digests";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { digestUnsubscribeSchema } from "#layers/core/shared/schemas/digests";

// Signed-out on purpose: the link in a Digest email works from any inbox. It is a POST from a page with a button, so a
// mail scanner opening the link does not unsubscribe anyone.
export default defineEventHandler(async (event) => {
	const parsed = digestUnsubscribeSchema.safeParse(await readBody(event).catch(() => null));
	const unsubscribe = parsed.success ? await readDigestUnsubscribeToken(parsed.data.token) : null;
	const site = unsubscribe && await getSiteById(unsubscribe.siteId);
	if (!unsubscribe || !site) {
		throw createError({ statusCode: 400, statusMessage: "Invalid link", message: "This unsubscribe link is not valid." });
	}
	await saveDigestSubscription(unsubscribe.memberId, site.id, "off");
	return { siteName: site.name };
});
