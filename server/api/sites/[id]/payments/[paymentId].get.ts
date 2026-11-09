import { getPayment } from "#layers/core/server/db/queries/revenue";
import { computeVisitorProfile } from "#layers/core/server/db/queries/visitors";
import type { PaymentJourney } from "#layers/core/shared/types/revenue";

export default defineEventHandler(async (event): Promise<PaymentJourney> => {
	const site = await requireSite(event);
	const payment = await getPayment(site.id, getRouterParam(event, "paymentId") ?? "");
	const profile = payment && await computeVisitorProfile(site, payment.visitorId);
	if (!payment || !profile) {
		throw createError({ statusCode: 404, statusMessage: "Payment not found" });
	}
	const stepsBeforePayment = profile.journeys.flatMap(journey => journey.steps).filter(step => step.timestamp <= payment.paidAt);
	return {
		payment,
		pageviews: stepsBeforePayment.filter(step => step.type === "pageview").length,
		events: stepsBeforePayment.filter(step => step.type === "event").length,
		profile,
	};
});
