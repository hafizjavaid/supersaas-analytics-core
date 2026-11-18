import type { BadgeOptions } from "#layers/core/shared/utils/badges";
import { BADGE_SIZES } from "#layers/core/shared/utils/badges";
import { formatCompactNumber, formatCount } from "#layers/core/shared/utils/format";

export interface BadgeFigures extends BadgeOptions {
	domain: string;
	visitors: number;
	series: number[];
}

const PALETTES = {
	light: { background: "#ffffff", border: "#e4e4e7", text: "#18181b", muted: "#71717a", line: "#007a55" },
	dark: { background: "#18181b", border: "#3f3f46", text: "#fafafa", muted: "#a1a1aa", line: "#00d492" },
};

const MAX_DOMAIN_LENGTH = 26;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TEXT_X = 39;
const SPARKLINE = { left: 214, right: 306, top: 12, bottom: 36 };

function escapeXml(value: string) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function paletteRules({ background, border, text, muted, line }: typeof PALETTES.light) {
	return `.bg{fill:${background};stroke:${border}}.tx{fill:${text}}.mu{fill:${muted}}.ln{stroke:${line}}.ar{fill:${line}}`;
}

function style(theme: BadgeOptions["theme"]) {
	if (theme === "auto") {
		return `${paletteRules(PALETTES.light)}@media (prefers-color-scheme: dark){${paletteRules(PALETTES.dark)}}`;
	}
	return paletteRules(PALETTES[theme]);
}

function shortenDomain(domain: string) {
	return domain.length > MAX_DOMAIN_LENGTH ? `${domain.slice(0, MAX_DOMAIN_LENGTH - 1)}…` : domain;
}

// The favicon's three bars, so the Badge needs no image of its own.
const MARK = `<rect x="10" y="13" width="22" height="22" rx="5.5" fill="#007a55"/><g fill="#fff"><rect x="15" y="24" width="2.75" height="6" rx=".7"/><rect x="19.6" y="18" width="2.75" height="12" rx=".7"/><rect x="24.2" y="21.25" width="2.75" height="8.75" rx=".7"/></g>`;

function frame({ theme, size }: BadgeOptions, title: string, body: string) {
	const { width, height } = BADGE_SIZES[size];
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="badge-title">`
		+ `<title id="badge-title">${escapeXml(title)}</title>`
		+ `<style>${style(theme)}</style>`
		+ `<rect class="bg" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="8"/>`
		+ MARK
		+ `<g font-family="${FONT}">${body}</g>`
		+ `</svg>`;
}

function sparklinePoints(series: number[]) {
	const highest = Math.max(1, ...series);
	const step = series.length > 1 ? (SPARKLINE.right - SPARKLINE.left) / (series.length - 1) : 0;
	return series.map((value, index) => {
		const x = SPARKLINE.left + index * step;
		const y = SPARKLINE.bottom - (value / highest) * (SPARKLINE.bottom - SPARKLINE.top);
		return `${x.toFixed(1)} ${y.toFixed(1)}`;
	});
}

function sparkline(series: number[]) {
	if (series.length < 2) {
		return "";
	}
	const points = sparklinePoints(series);
	const line = `M${points.join("L")}`;
	const area = `${line}L${SPARKLINE.right} ${SPARKLINE.bottom}L${SPARKLINE.left} ${SPARKLINE.bottom}Z`;
	const [lastX, lastY] = points.at(-1)!.split(" ");
	return `<path class="ar" d="${area}" fill-opacity=".14"/>`
		+ `<path class="ln badge-sparkline" d="${line}" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
		+ `<circle class="ar" cx="${lastX}" cy="${lastY}" r="2"/>`;
}

export function renderBadgeSvg({ domain, visitors, series, theme, size }: BadgeFigures) {
	const title = `${domain}: ${formatCount(visitors)} Visitors in the last 30 days, verified by Supersaas Analytics`;
	const body = `<text class="tx" x="${TEXT_X}" y="16" font-size="10" font-weight="600">${escapeXml(shortenDomain(domain))}</text>`
		+ `<text x="${TEXT_X}" y="30.5"><tspan class="tx" font-size="14" font-weight="700">${formatCompactNumber(visitors)}</tspan><tspan class="mu" dx="3.5" font-size="8.5">Visitors · last 30 days</tspan></text>`
		+ `<text class="mu" x="${TEXT_X}" y="42" font-size="8">verified by Supersaas Analytics</text>`
		+ (size === "wide" ? sparkline(series) : "");
	return frame({ theme, size }, title, body);
}

export function renderUnavailableBadgeSvg(options: BadgeOptions) {
	const body = `<text class="tx" x="${TEXT_X}" y="22" font-size="11" font-weight="600">Badge unavailable</text>`
		+ `<text class="mu" x="${TEXT_X}" y="36" font-size="8">Supersaas Analytics</text>`;
	return frame(options, "Badge unavailable", body);
}
