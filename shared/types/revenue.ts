import type { RevenueEnvironment, RevenueProviderId } from "../utils/revenue";
import type { ResolvedRange } from "../utils/dates";
import type { VisitorPlace, VisitorProfile, VisitorSource } from "./analytics";

// Revenue figures count only Payments in `currency`; the Payments table lists every currency.
export interface RevenueConnection {
	provider: RevenueProviderId;
	environment: RevenueEnvironment;
	currency: string;
	tokenHint: string;
	webhookUrl: string;
	// Ours to paste into the provider, or null for a provider that generates its own (Stripe), shown as a hint once set.
	webhookSecret: string | null;
	webhookSecretHint: string | null;
	createdAt: number;
	lastPaymentAt: number | null;
}

// `source` and `location` come from the payer's first Visit, which `timeToConvertSeconds` also counts from; an
// Identified visitor's first Visit can be on an earlier day.
export interface PaymentRow {
	id: string;
	visitorId: string;
	amount: number;
	currency: string;
	paidAt: number;
	source: VisitorSource | null;
	location: VisitorPlace | null;
	timeToConvertSeconds: number | null;
	visits: number;
}

export interface ConversionsSummary {
	revenue: number;
	payments: number;
	avgOrderValue: number;
	avgTimeToConvertSeconds: number | null;
}

export interface RevenuePoint {
	timestamp: number;
	revenue: number;
	payments: number;
}

export interface RevenueBreakdownRow {
	value: string;
	revenue: number;
	payments: number;
}

// `currency` is null while the Site has no Revenue connection. `total` counts every Payment in the Range, while
// `rows` holds the hundred newest.
export interface ConversionsReport {
	range: ResolvedRange;
	currency: string | null;
	summary: ConversionsSummary & { previous: ConversionsSummary };
	points: RevenuePoint[];
	sources: (RevenueBreakdownRow & { referrerDomain: string })[];
	countries: RevenueBreakdownRow[];
	rows: PaymentRow[];
	total: number;
}

// `emails` maps Payment ids to the customer's email, masked for Viewers, or null when the provider has none.
export interface PaymentCustomers {
	masked: boolean;
	emails: Record<string, string | null>;
}

export interface PaymentJourney {
	payment: PaymentRow;
	pageviews: number;
	events: number;
	profile: VisitorProfile;
}
