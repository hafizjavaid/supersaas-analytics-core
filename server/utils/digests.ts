import { generateText } from "ai";
import { digestExists, insertDigest, listDigestRecipients, newReferrers, pageviewsByPath, visitsByReferrer } from "#layers/core/server/db/queries/digests";
import { computeGoalReport } from "#layers/core/server/db/queries/goals";
import { computeSummary } from "#layers/core/server/db/queries/overview";
import type { Site } from "#layers/core/shared/types/analytics";
import type { Digest, DigestFigure, DigestReport } from "#layers/core/shared/types/digests";
import { resolveRange } from "#layers/core/shared/utils/dates";
import type { DigestFrequency, DigestPeriod } from "#layers/core/shared/utils/digests";
import { DIGEST_FREQUENCIES, DIGEST_TITLES, digestFigureRows, digestPeriodEnding, digestPeriodLabel, previousDigestPeriod, topMovers } from "#layers/core/shared/utils/digests";
import { appSecret } from "./app-secret";
import { equalInConstantTime } from "./standard-webhooks";
import { AI_DIGEST_MODEL_ID, isAiEnabled, resolveAiModel } from "./ai";

const encoder = new TextEncoder();

function figure(current: number, previous: number): DigestFigure {
	return { current, previous };
}

function rangeOf(site: Site, { fromDate, toDate }: DigestPeriod) {
	return resolveRange("custom", site.timezone, fromDate, toDate);
}

// Past whole days only, so the figures read Rollups, except Goals, which always read raw rows.
export async function computeDigestReport(site: Site, period: DigestPeriod): Promise<DigestReport> {
	const previousPeriod = previousDigestPeriod(period);
	const [summary, pages, previousPages, sources, previousSources, newSources, goals, previousGoals] = await Promise.all([
		computeSummary(site, rangeOf(site, period), []),
		pageviewsByPath(site.id, period),
		pageviewsByPath(site.id, previousPeriod),
		visitsByReferrer(site.id, period),
		visitsByReferrer(site.id, previousPeriod),
		newReferrers(site.id, period),
		computeGoalReport(site, rangeOf(site, period), []),
		computeGoalReport(site, rangeOf(site, previousPeriod), []),
	]);
	const { previous } = summary;
	return {
		period,
		previousPeriod,
		figures: {
			visitors: figure(summary.visitors, previous.visitors),
			visits: figure(summary.visits, previous.visits),
			pageviews: figure(summary.pageviews, previous.pageviews),
			bounceRate: figure(summary.bounceRate, previous.bounceRate),
			avgDurationSeconds: figure(summary.avgDurationSeconds, previous.avgDurationSeconds),
			conversionRate: summary.conversionRate === null ? null : figure(summary.conversionRate, previous.conversionRate ?? 0),
			revenue: summary.revenue === null ? null : figure(summary.revenue, previous.revenue ?? 0),
		},
		currency: summary.currency,
		pages: topMovers(pages, previousPages),
		sources: topMovers(sources, previousSources),
		newSources,
		goals: goals.goals.map(({ goal, conversions }) => ({
			name: goal.name,
			conversions: figure(conversions, previousGoals.goals.find(candidate => candidate.goal.id === goal.id)?.conversions ?? 0),
		})),
	};
}

function hasTraffic(report: DigestReport) {
	return report.figures.visitors.current > 0 || report.figures.visitors.previous > 0;
}

function moverLines(title: string, movers: DigestReport["pages"]) {
	return movers.length ? [`${title}:`, ...movers.map(mover => `- ${mover.label}: ${mover.current} (previous period ${mover.previous})`)] : [];
}

export function digestPrompt(siteName: string, frequency: DigestFrequency, report: DigestReport) {
	return [
		`${DIGEST_TITLES[frequency]} for ${siteName}, ${digestPeriodLabel(frequency, report.period)}, against the previous period of equal length.`,
		...digestFigureRows(report.figures, report.currency).map(row => `${row.label}: ${row.current} (previous period ${row.previous})`),
		...moverLines("Pages with the biggest change in pageviews", report.pages),
		...moverLines("Sources with the biggest change in visits", report.sources),
		...(report.newSources.length ? ["New Sources:", ...report.newSources.map(source => `- ${source.label}: ${source.visits} visits`)] : []),
		...(report.goals.length ? ["Goal conversions:", ...report.goals.map(goal => `- ${goal.name}: ${goal.conversions.current} (previous period ${goal.conversions.previous})`)] : []),
	].join("\n");
}

const SUMMARY_INSTRUCTIONS = "You write the opening of an analytics email. In 2 or 3 plain sentences, with no heading, list or markdown, say what changed most and what it likely means, using only the numbers given. Do not invent causes you cannot see in them.";

// A Digest still goes out without its summary when AI is not set up or the call fails.
export async function summarizeDigest(siteName: string, frequency: DigestFrequency, report: DigestReport): Promise<string | null> {
	if (!isAiEnabled()) {
		return null;
	}
	try {
		const { text } = await generateText({
			model: resolveAiModel(AI_DIGEST_MODEL_ID),
			system: SUMMARY_INSTRUCTIONS,
			prompt: digestPrompt(siteName, frequency, report),
			maxOutputTokens: 300,
		});
		return text.trim() || null;
	}
	catch (error) {
		console.error("[digests] summary failed", error);
		return null;
	}
}

async function unsubscribeSignature(memberId: string, siteId: string) {
	const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`digest-unsubscribe.${memberId}.${siteId}`)));
	return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

// No expiry: an unsubscribe link in an old email must keep working.
export async function digestUnsubscribeToken(memberId: string, siteId: string) {
	return `${memberId}.${siteId}.${await unsubscribeSignature(memberId, siteId)}`;
}

export async function readDigestUnsubscribeToken(token: string) {
	const [memberId, siteId, signed] = token.split(".");
	if (!memberId || !siteId || !signed || !equalInConstantTime(signed, await unsubscribeSignature(memberId, siteId))) {
		return null;
	}
	return { memberId, siteId };
}

export interface DigestRun {
	digests: number;
	emails: number;
}

// Undefined when the Digest exists already, or the Site had no Visitors in either period.
export async function buildDigest(site: Site, frequency: DigestFrequency, period: DigestPeriod): Promise<Digest | undefined> {
	if (await digestExists(site.id, frequency, period.fromDate)) {
		return undefined;
	}
	const report = await computeDigestReport(site, period);
	if (!hasTraffic(report)) {
		return undefined;
	}
	return insertDigest(site.id, frequency, report, await summarizeDigest(site.name, frequency, report));
}

async function emailDigest(site: Site & { organizationSlug: string }, digest: Digest, memberId: string, email: string, origin: string) {
	const periodLabel = digestPeriodLabel(digest.frequency, digest.report.period);
	await sendEmail({
		to: email,
		subject: `${site.name}: ${DIGEST_TITLES[digest.frequency]} for ${periodLabel}`,
		template: "digest",
		props: {
			url: `${origin}/app/${site.organizationSlug}/sites/${site.id}/insights?digest=${digest.id}`,
			unsubscribeUrl: `${origin}/digests/unsubscribe?token=${await digestUnsubscribeToken(memberId, site.id)}`,
			siteName: site.name,
			frequency: digest.frequency,
			periodLabel,
			summary: digest.summary,
			report: digest.report,
		},
	});
}

// Daily Digests are built only for a Site someone receives them for, to keep a Haiku call a day per Site off quiet
// Sites; weekly and monthly ones are always built, so the Insights page has them.
export async function sendSiteDigests(site: Site & { organizationSlug: string }, lastDay: string, origin: string): Promise<DigestRun> {
	const recipients = await listDigestRecipients(site.id);
	const run: DigestRun = { digests: 0, emails: 0 };
	for (const frequency of DIGEST_FREQUENCIES) {
		const period = digestPeriodEnding(frequency, lastDay);
		const receiving = recipients.filter(recipient => recipient.frequency === frequency);
		if (!period || (frequency === "daily" && receiving.length === 0)) {
			continue;
		}
		const digest = await buildDigest(site, frequency, period);
		if (!digest) {
			continue;
		}
		run.digests += 1;
		for (const recipient of receiving) {
			// The Digest is stored before its emails, so a failed send is not retried; it must not stop the others.
			try {
				await emailDigest(site, digest, recipient.memberId, recipient.email, origin);
				run.emails += 1;
			}
			catch (error) {
				console.error(`[digests] email to member ${recipient.memberId} failed`, error);
			}
		}
	}
	return run;
}
