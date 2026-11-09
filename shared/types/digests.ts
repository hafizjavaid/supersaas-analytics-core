import type { DigestFrequency, DigestMover, DigestPeriod, DigestSetting } from "../utils/digests";

export interface DigestFigure {
	current: number;
	previous: number;
}

// `conversionRate` is null while the Site has no Goals, and `revenue` (in the minor unit of `currency`) while it has no
// Revenue connection.
export interface DigestFigures {
	visitors: DigestFigure;
	visits: DigestFigure;
	pageviews: DigestFigure;
	bounceRate: DigestFigure;
	avgDurationSeconds: DigestFigure;
	conversionRate: DigestFigure | null;
	revenue: DigestFigure | null;
}

export interface DigestGoal {
	name: string;
	conversions: DigestFigure;
}

export interface DigestNewSource {
	label: string;
	visits: number;
}

export interface DigestReport {
	period: DigestPeriod;
	previousPeriod: DigestPeriod;
	figures: DigestFigures;
	currency: string | null;
	pages: DigestMover[];
	sources: DigestMover[];
	newSources: DigestNewSource[];
	goals: DigestGoal[];
}

export interface Digest {
	id: string;
	siteId: string;
	frequency: DigestFrequency;
	fromDate: string;
	toDate: string;
	summary: string | null;
	report: DigestReport;
	createdAt: number;
}

export interface DigestSubscription {
	siteId: string;
	siteName: string;
	siteDomain: string;
	frequency: DigestSetting;
}
