import { describe, expect, it } from "vitest";
import { renderBadgeSvg, renderUnavailableBadgeSvg } from "#layers/core/server/utils/badge-image";
import { readBadgeOptions } from "#layers/core/shared/utils/badges";

const thirtyDays = Array.from({ length: 30 }, (_, day) => 100 + day);

function externalReferences(svg: string) {
	return svg.replaceAll("http://www.w3.org/2000/svg", "").match(/https?:|<image|@import|url\(|@font-face/g) ?? [];
}

describe("renderBadgeSvg", () => {
	it("shows the domain, the compact number, the period and the branding at the small size", () => {
		const svg = renderBadgeSvg({ domain: "example.com", visitors: 3_240, series: thirtyDays, theme: "light", size: "small" });
		expect(svg).toMatch(/^<svg [^>]*width="200" height="48"/);
		expect(svg).toContain("example.com");
		expect(svg).toContain(">3.2K<");
		expect(svg).toContain("Visitors · last 30 days");
		expect(svg).toContain("verified by Supersaas Analytics");
		expect(svg).not.toContain("badge-sparkline");
	});

	it("names itself for screen readers", () => {
		const svg = renderBadgeSvg({ domain: "example.com", visitors: 3_240, series: [], theme: "light", size: "small" });
		expect(svg).toContain(`role="img"`);
		expect(svg).toContain("<title id=\"badge-title\">example.com: 3,240 Visitors in the last 30 days, verified by Supersaas Analytics</title>");
		expect(svg).toContain(`aria-labelledby="badge-title"`);
	});

	it("adds a 30-day sparkline at the wide size", () => {
		const svg = renderBadgeSvg({ domain: "example.com", visitors: 3_240, series: thirtyDays, theme: "light", size: "wide" });
		expect(svg).toMatch(/^<svg [^>]*width="320" height="48"/);
		const line = svg.match(/badge-sparkline" d="M([^"]+)"/)?.[1];
		expect(line?.split("L")).toHaveLength(30);
	});

	it("draws a flat sparkline for a Site without traffic", () => {
		const svg = renderBadgeSvg({ domain: "example.com", visitors: 0, series: Array.from({ length: 30 }, () => 0), theme: "light", size: "wide" });
		expect(svg).toContain(">0<");
		expect(svg).not.toContain("NaN");
	});

	it("follows the viewer's colour scheme only for the auto theme", () => {
		const badge = { domain: "example.com", visitors: 1, series: [], size: "small" } as const;
		expect(renderBadgeSvg({ ...badge, theme: "auto" })).toContain("@media (prefers-color-scheme: dark)");
		expect(renderBadgeSvg({ ...badge, theme: "light" })).not.toContain("@media");
		expect(renderBadgeSvg({ ...badge, theme: "dark" })).not.toContain("@media");
		expect(renderBadgeSvg({ ...badge, theme: "dark" })).not.toBe(renderBadgeSvg({ ...badge, theme: "light" }));
	});

	it("escapes the domain and shortens a long one", () => {
		const escaped = renderBadgeSvg({ domain: "a<b>&\"c.com", visitors: 1, series: [], theme: "light", size: "small" });
		expect(escaped).toContain("a&lt;b&gt;&amp;&quot;c.com");
		const long = renderBadgeSvg({ domain: "a-very-long-subdomain-name.example.co.uk", visitors: 1, series: [], theme: "light", size: "small" });
		expect(long).toContain("…</text>");
		expect(long).toContain("<title id=\"badge-title\">a-very-long-subdomain-name.example.co.uk:");
	});

	it("loads no font, image or stylesheet from elsewhere", () => {
		for (const theme of ["auto", "light", "dark"] as const) {
			for (const size of ["small", "wide"] as const) {
				expect(externalReferences(renderBadgeSvg({ domain: "example.com", visitors: 12, series: thirtyDays, theme, size }))).toEqual([]);
			}
		}
	});
});

describe("renderUnavailableBadgeSvg", () => {
	it("reads Badge unavailable at the requested size, with no number", () => {
		const svg = renderUnavailableBadgeSvg({ theme: "auto", size: "wide" });
		expect(svg).toMatch(/^<svg [^>]*width="320" height="48"/);
		expect(svg).toContain("Badge unavailable");
		expect(svg).toContain("<title id=\"badge-title\">Badge unavailable</title>");
		expect(svg).not.toContain("Visitors");
		expect(externalReferences(svg)).toEqual([]);
	});
});

describe("readBadgeOptions", () => {
	it("reads the theme and size, falling back to auto and small", () => {
		expect(readBadgeOptions({ theme: "dark", size: "wide" })).toEqual({ theme: "dark", size: "wide" });
		expect(readBadgeOptions({})).toEqual({ theme: "auto", size: "small" });
		expect(readBadgeOptions({ theme: "neon", size: ["wide", "small"] })).toEqual({ theme: "auto", size: "small" });
	});
});
