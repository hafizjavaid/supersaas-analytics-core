import type { H3Event } from "h3";
import { getSiteById } from "#layers/core/server/db/queries/sites";
import { apiV1ReportQuerySchema } from "#layers/core/shared/schemas/api-v1";
import type { ApiV1Funnel, ApiV1FunnelStep, ApiV1Range } from "#layers/core/shared/schemas/api-v1";
import type { Funnel, Site } from "#layers/core/shared/types/analytics";
import { resolveRange } from "#layers/core/shared/utils/dates";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";
import { parseFilters } from "#layers/core/shared/utils/filters";
import type { FunnelStep } from "#layers/core/shared/utils/funnels";

// A Site of another Organization answers the same 404 as a missing one.
export async function requireApiV1Site(event: H3Event) {
	const apiKey = await requireApiKey(event);
	const site = await getSiteById(getRouterParam(event, "id") ?? "");
	if (!site || site.organizationId !== apiKey.organization.id) {
		throw createError({ statusCode: 404, statusMessage: "Site not found" });
	}
	return site;
}

export async function requireApiV1SiteAndRange(event: H3Event) {
	const site = await requireApiV1Site(event);
	const parsed = apiV1ReportQuerySchema.safeParse(getQuery(event));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const { range, from, to, f } = parsed.data;
	return { site, range: resolveRange(range, site.timezone, from, to), filters: parseFilters(f) };
}

export function apiV1SiteRef(site: Site) {
	return { id: site.id, name: site.name, domain: site.domain };
}

export function apiV1Range(range: ResolvedRange): ApiV1Range {
	return { from: range.fromDate, to: range.toDate, hours: range.hours ?? null };
}

export function apiV1FunnelStep(step: FunnelStep): ApiV1FunnelStep {
	return { kind: step.kind, value: step.value, label: step.label };
}

export function apiV1Funnel(funnel: Funnel): ApiV1Funnel {
	return { id: funnel.id, name: funnel.name, window: funnel.window, steps: funnel.steps.map(apiV1FunnelStep) };
}
