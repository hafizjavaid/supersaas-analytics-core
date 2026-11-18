import type { ShareLink } from "#layers/core/shared/types/analytics";
import type { UpdateShareLinkInput } from "#layers/core/shared/schemas/share-links";

export const BADGE_THEMES = ["auto", "light", "dark"] as const;
export type BadgeTheme = typeof BADGE_THEMES[number];

export const BADGE_SIZES = {
	small: { width: 200, height: 48 },
	wide: { width: 320, height: 48 },
} as const;
export type BadgeSize = keyof typeof BADGE_SIZES;

export interface BadgeOptions {
	theme: BadgeTheme;
	size: BadgeSize;
}

export function readBadgeOptions(query: Record<string, unknown>): BadgeOptions {
	return {
		theme: BADGE_THEMES.find(theme => theme === query.theme) ?? "auto",
		size: query.size === "wide" ? "wide" : "small",
	};
}

export interface BadgeSnippetInput {
	origin: string;
	token: string;
	domain: string;
	theme: BadgeTheme;
	size: BadgeSize;
}

function escapeAttribute(value: string) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function badgeImagePath(token: string, theme: BadgeTheme, size: BadgeSize) {
	return `/badge/${token}.svg?theme=${theme}&size=${size}`;
}

export function badgeSnippet({ origin, token, domain, theme, size }: BadgeSnippetInput) {
	const { width, height } = BADGE_SIZES[size];
	const alt = escapeAttribute(`${domain} traffic, verified by Supersaas Analytics`);
	return `<a href="${origin}/share/${token}?ref=badge" target="_blank" rel="noopener nofollow">
  <img src="${origin}${badgeImagePath(token, theme, size)}"
       alt="${alt}" width="${width}" height="${height}"/>
</a>`;
}

export function canHaveBadge(link: Pick<ShareLink, "hasPassword" | "outboundUrl">) {
	return !link.hasPassword && !link.outboundUrl;
}

export function shareLinkChangeRefusal(link: Pick<ShareLink, "hasPassword" | "outboundUrl" | "badge">, change: UpdateShareLinkInput) {
	const badge = change.badge ?? link.badge;
	if (!badge) {
		return undefined;
	}
	if (link.outboundUrl) {
		return "An Outbound link's Share link cannot have a Badge";
	}
	if (change.password) {
		return "Turn the Badge off before setting a password";
	}
	if (link.hasPassword) {
		return "A Share link with a password cannot have a Badge";
	}
	return undefined;
}
