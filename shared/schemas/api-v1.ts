import { z } from "zod";
import { TOP_LIST_DIMENSIONS } from "../utils/ai";
import { isDate, RANGE_KEYS } from "../utils/dates";
import { FILTER_DIMENSIONS, FILTER_EXAMPLES, parseFilter } from "../utils/filters";
import { FUNNEL_STEP_KINDS, FUNNEL_WINDOWS } from "../utils/funnels";
import { GOAL_KINDS } from "../utils/goals";

// API v1's response shapes. They are a public contract: renaming a dashboard field must never change them, so each
// handler maps the dashboard's results into these field by field.

const rate = z.number().describe("A share from 0 to 1");

export const apiV1FilterSchema = z.string().refine(raw => parseFilter(raw) !== null, { error: issue => `Unknown Filter: ${String(issue.input)}` });

// Stricter than the dashboard, which falls back to 30 days and drops what it cannot read: a program should hear why.
export const apiV1ReportQuerySchema = z.object({
	range: z.enum(RANGE_KEYS).default("30d").describe("today, yesterday, 24h, 7d, 30d, 90d, 6m, 12m, or custom with from and to"),
	from: z.string().refine(isDate, "Use YYYY-MM-DD").optional().describe("First day of a custom Range, YYYY-MM-DD in the Site's timezone"),
	to: z.string().refine(isDate, "Use YYYY-MM-DD").optional().describe("Last day of a custom Range, YYYY-MM-DD in the Site's timezone"),
	f: z.union([apiV1FilterSchema, z.array(apiV1FilterSchema)]).optional()
		.transform(raw => raw === undefined ? [] : [raw].flat())
		.describe(`Repeated Filters as dimension:value, such as ${FILTER_EXAMPLES.join(" or ")}. Dimensions: ${FILTER_DIMENSIONS.join(", ")}`),
}).refine(query => query.range !== "custom" || (query.from && query.to), { message: "A custom Range needs from and to", path: ["range"] });

export type ApiV1ReportQuery = z.infer<typeof apiV1ReportQuerySchema>;

export const apiV1RangeSchema = z.object({
	from: z.string().describe("First day, YYYY-MM-DD in the Site's timezone"),
	to: z.string().describe("Last day, YYYY-MM-DD in the Site's timezone"),
	hours: z.number().nullable().describe("Set for a rolling window ending now (24 for `24h`); `from` and `to` then only label it"),
});

export const apiV1SiteSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string(),
	timezone: z.string().describe("IANA timezone the Site's days are counted in"),
	createdAt: z.number().describe("Unix seconds"),
});

export const apiV1SitesSchema = z.object({
	sites: z.array(apiV1SiteSchema),
});

const apiV1SiteRefSchema = apiV1SiteSchema.pick({ id: true, name: true, domain: true });

export const apiV1TotalsSchema = z.object({
	visitors: z.number(),
	visits: z.number(),
	pageviews: z.number(),
	bounceRate: rate,
	avgVisitDurationSeconds: z.number(),
	conversionRate: rate.nullable().describe("Null while the Site has no Goals"),
	revenue: z.number().nullable().describe("In the minor unit of `currency`; null without a Revenue connection"),
});

export const apiV1SummarySchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	currency: z.string().nullable(),
	current: apiV1TotalsSchema,
	previous: apiV1TotalsSchema.describe("The period of equal length just before the Range"),
});

export const apiV1TimeseriesSchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	interval: z.enum(["hour", "day"]).describe("Hourly for a single day or 24 hours, daily otherwise"),
	points: z.array(z.object({
		timestamp: z.number().describe("Unix seconds at the start of the hour or day"),
		visitors: z.number(),
		pageviews: z.number(),
	})),
});

export const apiV1TopListSchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	dimension: z.enum(TOP_LIST_DIMENSIONS),
	metric: z.enum(["pageviews", "visits", "clicks", "events"]).describe("What `value` counts"),
	total: z.number(),
	rows: z.array(z.object({ label: z.string(), value: z.number() })).describe("The ten largest"),
});

export const apiV1GoalsSchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	visitors: z.number(),
	converted: z.number().describe("Visitors who completed any Goal"),
	conversionRate: rate,
	goals: z.array(z.object({
		id: z.string(),
		name: z.string(),
		kind: z.enum(GOAL_KINDS),
		value: z.string(),
		conversions: z.number().describe("Every completion"),
		visitors: z.number().describe("Unique Visitors who converted"),
		conversionRate: rate,
	})),
});

const apiV1FunnelStepSchema = z.object({
	kind: z.enum(FUNNEL_STEP_KINDS),
	value: z.string(),
	label: z.string(),
});

const apiV1FunnelSchema = z.object({
	id: z.string(),
	name: z.string(),
	window: z.enum(FUNNEL_WINDOWS).describe("How long a person has from the first step to the last"),
	steps: z.array(apiV1FunnelStepSchema),
});

export const apiV1FunnelsSchema = z.object({
	site: apiV1SiteRefSchema,
	funnels: z.array(apiV1FunnelSchema),
});

export const apiV1FunnelReportSchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	funnel: apiV1FunnelSchema,
	visitors: z.number(),
	entered: z.number(),
	completed: z.number(),
	enteredRate: rate,
	conversionRate: rate.describe("Completed out of entered"),
	steps: z.array(z.object({
		step: apiV1FunnelStepSchema,
		label: z.string().describe("The step's label, else its value"),
		visitors: z.number(),
		entryRate: rate,
		continueRate: rate.nullable().describe("Out of the step before; null for the first step"),
		dropped: z.number(),
	})),
});

const apiV1PaymentTotalsSchema = z.object({
	revenue: z.number(),
	payments: z.number(),
	avgOrderValue: z.number(),
	avgTimeToConvertSeconds: z.number().nullable(),
});

const apiV1RevenueRowSchema = z.object({ value: z.string(), revenue: z.number(), payments: z.number() });

export const apiV1PaymentsSchema = z.object({
	site: apiV1SiteRefSchema,
	range: apiV1RangeSchema,
	currency: z.string().describe("Every amount is in this currency's minor unit, such as cents"),
	current: apiV1PaymentTotalsSchema,
	previous: apiV1PaymentTotalsSchema,
	sources: z.array(apiV1RevenueRowSchema).describe("Revenue by the payer's first Source, the ten largest"),
	countries: z.array(apiV1RevenueRowSchema).describe("Revenue by the payer's country, the ten largest"),
});

export const apiV1LiveSchema = z.object({
	site: apiV1SiteRefSchema,
	visitors: z.number().describe("Visitors seen in the last 5 minutes"),
});

export type ApiV1Range = z.infer<typeof apiV1RangeSchema>;
export type ApiV1Site = z.infer<typeof apiV1SiteSchema>;
export type ApiV1Sites = z.infer<typeof apiV1SitesSchema>;
export type ApiV1Totals = z.infer<typeof apiV1TotalsSchema>;
export type ApiV1Summary = z.infer<typeof apiV1SummarySchema>;
export type ApiV1Timeseries = z.infer<typeof apiV1TimeseriesSchema>;
export type ApiV1TopList = z.infer<typeof apiV1TopListSchema>;
export type ApiV1Goals = z.infer<typeof apiV1GoalsSchema>;
export type ApiV1FunnelStep = z.infer<typeof apiV1FunnelStepSchema>;
export type ApiV1Funnel = z.infer<typeof apiV1FunnelSchema>;
export type ApiV1Funnels = z.infer<typeof apiV1FunnelsSchema>;
export type ApiV1FunnelReport = z.infer<typeof apiV1FunnelReportSchema>;
export type ApiV1Payments = z.infer<typeof apiV1PaymentsSchema>;
export type ApiV1Live = z.infer<typeof apiV1LiveSchema>;
