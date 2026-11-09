import { getPaymentCustomers, getRevenueConnection } from "#layers/core/server/db/queries/revenue";
import type { PaymentCustomers } from "#layers/core/shared/types/revenue";
import { maskEmail } from "#layers/core/shared/utils/revenue";

const MAX_PAYMENTS = 100;
// Keeps a table of a hundred customers inside the provider's rate limit.
const LOOKUPS_AT_ONCE = 10;

// `?payment=` repeated. Emails are fetched from the provider on every view and never stored; Viewers get them masked.
export default defineEventHandler(async (event): Promise<PaymentCustomers> => {
	const { site, membership } = await requireSiteMembership(event);
	const masked = !roleCan(membership.role, { customerEmail: ["read"] });

	const requested = [getQuery(event).payment].flat().filter((id): id is string => typeof id === "string").slice(0, MAX_PAYMENTS);
	const connection = await getRevenueConnection(site.id);
	const customers = requested.length > 0 ? await getPaymentCustomers(site.id, requested) : [];
	const provider = connection && revenueProviders[connection.provider];

	const customerIds = Array.from(new Set(customers.flatMap(customer => customer.customerId ?? [])));
	const emailsByCustomer = new Map<string, string | null>();
	for (let index = 0; provider && index < customerIds.length; index += LOOKUPS_AT_ONCE) {
		const batch = customerIds.slice(index, index + LOOKUPS_AT_ONCE);
		const emails = await Promise.all(batch.map(customerId => provider.fetchCustomerEmail(connection, customerId)));
		batch.forEach((customerId, at) => emailsByCustomer.set(customerId, emails[at] ?? null));
	}

	return {
		masked,
		emails: Object.fromEntries(customers.map((customer) => {
			const email = customer.customerId ? emailsByCustomer.get(customer.customerId) ?? null : null;
			return [customer.id, email && masked ? maskEmail(email) : email];
		})),
	};
});
