import type { H3Event } from "h3";
import { dailySalt } from "#layers/core/server/db/queries/salts";
import { getSiteWithSecret } from "#layers/core/server/db/queries/sites";
import {
	findLatestVisit,
	insertEvent,
	insertOutboundLink,
	insertPage,
	recordVisitPageview,
	resolveDeviceId,
	resolveLocationId,
	resolveSourceId,
	upsertVisitor,
} from "#layers/core/server/db/queries/ingestion";
import type { CollectRequest } from "#layers/core/shared/schemas/collect";
import { collectRequestSchema } from "#layers/core/shared/schemas/collect";

const MAX_COLLECT_BODY_BYTES = 16 * 1024;

// sd.js reads it for `sd.visitorId()`, so a Site can pass the Visitor into checkout metadata.
export const VISITOR_ID_HEADER = "Sd-Visitor";

export const COLLECT_CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Expose-Headers": VISITOR_ID_HEADER,
};

interface HitContext {
	visitorId: string;
	ip: string;
	userAgent: string;
	geo: GeoInfo;
	nowSec: number;
	origin: string;
}

type Site = NonNullable<Awaited<ReturnType<typeof getSiteWithSecret>>>;

// `navigator.sendBeacon` posts `text/plain`, so the body is read as raw bytes and parsed here instead of relying on the content type.
export async function readCollectRequest(event: H3Event): Promise<CollectRequest | null> {
	try {
		if (Number(getRequestHeader(event, "content-length") ?? 0) > MAX_COLLECT_BODY_BYTES) {
			return null;
		}
		const raw = await readRawBody(event, false);
		if (!raw || raw.byteLength > MAX_COLLECT_BODY_BYTES) {
			return null;
		}
		const parsed = collectRequestSchema.safeParse(JSON.parse(new TextDecoder().decode(raw)));
		return parsed.success ? parsed.data : null;
	}
	catch {
		return null;
	}
}

export async function readHitContext(event: H3Event, siteId: string): Promise<HitContext> {
	const ip = getClientIp(event);
	const userAgent = getRequestHeader(event, "user-agent") ?? "";
	return {
		visitorId: await computeVisitorId(await dailySalt(), siteId, ip, userAgent),
		ip,
		userAgent,
		geo: extractGeo(event),
		nowSec: Math.floor(Date.now() / 1000),
		origin: getRequestURL(event).origin,
	};
}

// Excluded hits return before anything is written, so the edition never sees them.
export async function recordHit(data: CollectRequest, context: HitContext): Promise<void> {
	if (isBotUserAgent(context.userAgent)) {
		return;
	}
	const site = await getSiteWithSecret(data.site_id);
	if (!site || isExcludedHit(site, data, context) || !serverEdition().admitHit(site)) {
		return;
	}
	if (await storeCountableHit(site, data, context)) {
		await serverEdition().afterCountableHit(site, context.origin, context.nowSec * 1000);
	}
}

async function storeCountableHit(site: Site, data: CollectRequest, context: HitContext): Promise<boolean> {
	const { visitorId } = context;
	if (data.identify) {
		const identityHash = await hashIdentity(site.secret, data.identify);
		await upsertVisitor({ siteId: site.id, visitorId, nowSec: context.nowSec, identityHash });
		return false;
	}

	const isPageview = !data.outbound_url && !data.name && Boolean(data.path);
	const { latitude, longitude } = context.geo;
	const coordinates = isPageview && latitude !== null && longitude !== null ? { latitude, longitude } : undefined;
	await upsertVisitor({ siteId: site.id, visitorId, nowSec: context.nowSec, coordinates });

	if (data.outbound_url) {
		return recordOutboundLink(site, visitorId, data.outbound_url, context.nowSec);
	}
	if (data.name) {
		return recordEvent(site.id, visitorId, data, context.nowSec);
	}
	if (data.path) {
		await recordPageview(site, visitorId, data.path, data, context);
		return true;
	}
	return false;
}

function isExcludedHit(site: Site, data: CollectRequest, context: HitContext) {
	return ipMatchesAnyRule(context.ip, site.excludedIps)
		|| (!!data.path && pathMatchesAnyRule(data.path, site.excludedPaths));
}

async function recordOutboundLink(site: Site, visitorId: string, value: string, nowSec: number) {
	const url = normalizeOutboundUrl(value, site.domain);
	if (!url) {
		return false;
	}
	await insertOutboundLink({ siteId: site.id, visitorId, url, timestamp: nowSec });
	return true;
}

// An Event only means something inside a Visit, so one sent before any Pageview is dropped.
async function recordEvent(siteId: string, visitorId: string, data: CollectRequest, nowSec: number) {
	const visit = await findLatestVisit(visitorId);
	if (!visit || !data.name) {
		return false;
	}
	await insertEvent({
		siteId,
		visitId: visit.id,
		name: data.name,
		props: data.props && Object.keys(data.props).length > 0 ? JSON.stringify(data.props) : null,
		path: data.path ?? null,
		timestamp: nowSec,
	});
	return true;
}

async function recordPageview(site: Site, visitorId: string, path: string, data: CollectRequest, context: HitContext) {
	const source = parseSource(data.referrer ?? null, site.domain, {
		utmSource: data.utm_source,
		utmMedium: data.utm_medium,
		utmCampaign: data.utm_campaign,
		utmTerm: data.utm_term,
		utmContent: data.utm_content,
	});
	const [sourceId, deviceId, locationId] = await Promise.all([
		resolveSourceId(site.id, source),
		resolveDeviceId(parseUserAgent(context.userAgent)),
		resolveLocationId(context.geo),
	]);

	const visitId = await recordVisitPageview({ siteId: site.id, visitorId, path, nowSec: context.nowSec, sourceId, deviceId, locationId });
	await insertPage({ siteId: site.id, visitId, path, title: data.title ?? null, timestamp: context.nowSec });
}
