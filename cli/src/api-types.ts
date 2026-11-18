// The API v1 fields this CLI reads. `--json` prints the whole response, so fields not listed here still reach scripts.

export interface SiteRef {
	id: string;
	name: string;
	domain: string;
}

export interface ReportRange {
	from: string;
	to: string;
	hours: number | null;
}

export interface Site extends SiteRef {
	timezone: string;
	createdAt: number;
}

export interface Sites {
	sites: Site[];
}

export interface Totals {
	visitors: number;
	visits: number;
	pageviews: number;
	bounceRate: number;
	avgVisitDurationSeconds: number;
	conversionRate: number | null;
	revenue: number | null;
}

export interface Summary {
	site: SiteRef;
	range: ReportRange;
	currency: string | null;
	current: Totals;
	previous: Totals;
}

export interface TopList {
	site: SiteRef;
	range: ReportRange;
	dimension: string;
	metric: string;
	total: number;
	rows: { label: string; value: number }[];
}

export interface Live {
	site: SiteRef;
	visitors: number;
}

export interface Goals {
	site: SiteRef;
	range: ReportRange;
	visitors: number;
	converted: number;
	conversionRate: number;
	goals: {
		id: string;
		name: string;
		kind: string;
		value: string;
		conversions: number;
		visitors: number;
		conversionRate: number;
	}[];
}

export interface FunnelStep {
	kind: string;
	value: string;
	label: string;
}

export interface Funnel {
	id: string;
	name: string;
	window: string;
	steps: FunnelStep[];
}

export interface Funnels {
	site: SiteRef;
	funnels: Funnel[];
}

export interface FunnelReport {
	site: SiteRef;
	range: ReportRange;
	funnel: Funnel;
	visitors: number;
	entered: number;
	completed: number;
	enteredRate: number;
	conversionRate: number;
	steps: {
		label: string;
		visitors: number;
		entryRate: number;
		continueRate: number | null;
		dropped: number;
	}[];
}
