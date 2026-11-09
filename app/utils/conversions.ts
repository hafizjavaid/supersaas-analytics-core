import type { PaymentRow } from "#layers/core/shared/types/revenue";
import { formatMoney } from "#layers/core/shared/utils/revenue";

const UNITS = [
	{ seconds: 86_400, one: "day", many: "days" },
	{ seconds: 3600, one: "h", many: "h" },
	{ seconds: 60, one: "min", many: "min" },
];

export function formatTimeToConvert(seconds: number | null): string {
	if (seconds === null) {
		return "–";
	}
	const unit = UNITS.find(candidate => seconds >= candidate.seconds);
	if (!unit) {
		return "under 1 min";
	}
	const count = Math.floor(seconds / unit.seconds);
	return `${count} ${count === 1 ? unit.one : unit.many}`;
}

export function paymentHeadline(payment: Pick<PaymentRow, "amount" | "currency" | "timeToConvertSeconds">): string {
	const amount = formatMoney(payment.amount, payment.currency);
	return payment.timeToConvertSeconds === null
		? amount
		: `${amount} · converted ${formatTimeToConvert(payment.timeToConvertSeconds)} after first visit`;
}
