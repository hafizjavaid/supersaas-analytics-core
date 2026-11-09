export interface ParsedSource {
	referrerDomain: string;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmTerm: string | null;
	utmContent: string | null;
}

export interface CampaignParams {
	utmSource?: string | null;
	utmMedium?: string | null;
	utmCampaign?: string | null;
	utmTerm?: string | null;
	utmContent?: string | null;
}

export function normalizeHostname(value: string): string | null {
	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		return url.hostname.toLowerCase().replace(/^www\./, "") || null;
	}
	catch {
		return null;
	}
}

function normalizeCampaignValue(value: string | null | undefined): string | null {
	return value?.trim() || null;
}

export function parseSource(referrer: string | null, siteDomain: string, campaign: CampaignParams = {}): ParsedSource {
	const referrerHost = referrer ? normalizeHostname(referrer) : null;
	const isExternal = referrerHost !== null && referrerHost !== normalizeHostname(siteDomain);
	return {
		referrerDomain: isExternal ? referrerHost : "(direct)",
		utmSource: normalizeCampaignValue(campaign.utmSource),
		utmMedium: normalizeCampaignValue(campaign.utmMedium),
		utmCampaign: normalizeCampaignValue(campaign.utmCampaign),
		utmTerm: normalizeCampaignValue(campaign.utmTerm),
		utmContent: normalizeCampaignValue(campaign.utmContent),
	};
}

// Query strings and hashes are dropped so a tracked URL never carries tokens or per-user parameters.
export function normalizeOutboundUrl(value: string, siteDomain: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		if (normalizeHostname(url.hostname) === normalizeHostname(siteDomain)) {
			return null;
		}
		return `${url.origin}${url.pathname}`;
	}
	catch {
		return null;
	}
}
