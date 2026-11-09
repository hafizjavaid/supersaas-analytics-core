export const REVENUE_PROVIDERS = ["polar", "stripe"] as const;
export type RevenueProviderId = typeof REVENUE_PROVIDERS[number];

export const REVENUE_ENVIRONMENTS = ["production", "sandbox"] as const;
export type RevenueEnvironment = typeof REVENUE_ENVIRONMENTS[number];

export const REVENUE_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "chf", "sek", "inr", "jpy", "brl"] as const;
export type RevenueCurrency = typeof REVENUE_CURRENCIES[number];

export function isRevenueCurrency(value: string): value is RevenueCurrency {
	return REVENUE_CURRENCIES.includes(value as RevenueCurrency);
}

// Stripe connects with a restricted key, whose prefix says whether it is a test-mode key.
export function stripeEnvironmentOf(key: string): RevenueEnvironment | null {
	if (key.startsWith("rk_test_")) {
		return "sandbox";
	}
	if (key.startsWith("rk_live_")) {
		return "production";
	}
	return null;
}

export const VISITOR_METADATA_KEY = "sd_visitor_id";

const VISITOR_ID_PATTERN = /^[0-9a-f]{32}$/;

export function isVisitorId(value: unknown): value is string {
	return typeof value === "string" && VISITOR_ID_PATTERN.test(value);
}

export function maskEmail(email: string): string {
	const at = email.lastIndexOf("@");
	if (at < 1) {
		return "***";
	}
	return `${email[0]}***${email.slice(at)}`;
}

function fractionDigits(currency: string) {
	try {
		return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
	}
	catch {
		return 2;
	}
}

export function formatMoney(minorUnits: number, currency: string, { compact = false } = {}): string {
	const digits = fractionDigits(currency);
	const amount = minorUnits / 10 ** digits;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			...(compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: Number.isInteger(amount) ? 0 : digits }),
		}).format(amount);
	}
	catch {
		return `${amount.toFixed(digits)} ${currency.toUpperCase()}`;
	}
}

export function formatRevenue(minorUnits: number, currency: string): string {
	return formatMoney(minorUnits, currency, { compact: minorUnits >= 1_000_000 });
}

export function tokenHint(token: string): string {
	return `…${token.slice(-4)}`;
}
