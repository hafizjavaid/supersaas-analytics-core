import { describe, expect, it } from "vitest";
import { adminNavigation, reportQueryOf, shareNavigation, sidebarNavigation, siteSettingsSections, organizationSettingsSections } from "#layers/core/app/utils/navigation";

describe("sidebarNavigation", () => {
	it("shows the built all-sites items in order", () => {
		const items = sidebarNavigation({ organizationSlug: "acme" });
		expect(items.map(item => [item.label, item.to])).toEqual([
			["Sites", "/app/acme"],
			["Live", "/app/acme/live"],
			["Search", "/app/acme/search"],
			["Settings", "/app/acme/settings"],
		]);
	});

	it("appends the edition's Organization items after Settings, under the Organization's path", () => {
		const items = sidebarNavigation({
			organizationSlug: "acme",
			organizationLinks: [{ label: "Billing", icon: "i-material-symbols-credit-card-outline", to: "billing" }],
		});
		expect(items.map(item => [item.label, item.to])).toEqual([
			["Sites", "/app/acme"],
			["Live", "/app/acme/live"],
			["Search", "/app/acme/search"],
			["Settings", "/app/acme/settings"],
			["Billing", "/app/acme/billing"],
		]);
		expect(sidebarNavigation({ organizationSlug: "acme", siteId: "site-1", organizationLinks: items }).map(item => item.label)).not.toContain("Billing");
	});

	it("shows the built site items, starting with the way back to all sites", () => {
		const items = sidebarNavigation({ organizationSlug: "acme", siteId: "site-1" });
		expect(items.map(item => [item.label, item.to])).toEqual([
			["All sites", "/app/acme"],
			["Analytics", "/app/acme/sites/site-1"],
			["Live", "/app/acme/sites/site-1/live"],
			["Pages", "/app/acme/sites/site-1/pages"],
			["Users", "/app/acme/sites/site-1/users"],
			["Journeys", "/app/acme/sites/site-1/journeys"],
			["Funnels", "/app/acme/sites/site-1/funnels"],
			["Conversions", "/app/acme/sites/site-1/conversions"],
			["Links", "/app/acme/sites/site-1/links"],
			["Search", "/app/acme/sites/site-1/search"],
			["Insights", "/app/acme/sites/site-1/insights"],
			["Settings", "/app/acme/sites/site-1/settings"],
		]);
	});

	it("keeps the Range and Filters only on report pages", () => {
		const items = sidebarNavigation({ organizationSlug: "acme", siteId: "site-1" });
		expect(items.filter(item => item.keepsReportQuery).map(item => item.label)).toEqual(["Analytics", "Pages", "Users", "Journeys", "Funnels", "Conversions", "Links"]);
	});

	it("shows Ask AI on both levels once AI is set up", () => {
		expect(sidebarNavigation({ organizationSlug: "acme", ai: true }).map(item => item.label)).toContain("Ask AI");
		const siteItems = sidebarNavigation({ organizationSlug: "acme", siteId: "site-1", ai: true });
		expect(siteItems.find(item => item.label === "Ask AI")?.to).toBe("/app/acme/sites/site-1/ask");
		expect(sidebarNavigation({ organizationSlug: "acme", siteId: "site-1" }).map(item => item.label)).not.toContain("Ask AI");
	});

	it("gives every item an icon for the rail", () => {
		for (const item of [...sidebarNavigation({ organizationSlug: "acme" }), ...sidebarNavigation({ organizationSlug: "acme", siteId: "s" })]) {
			expect(item.icon, item.label).toMatch(/^i-material-symbols-/);
		}
	});
});

describe("adminNavigation", () => {
	it("lists Users, Organizations and Database", () => {
		expect(adminNavigation().map(item => item.label)).toEqual(["Back to the app", "Users", "Organizations", "Database"]);
	});

	it("adds the edition's admin pages last", () => {
		const extra = { label: "Audit", icon: "i-material-symbols-history-rounded", to: "/app/admin/audit" };
		expect(adminNavigation([extra]).at(-1)).toEqual(extra);
	});
});

describe("shareNavigation", () => {
	it("shows only the read-only reports, each keeping the Range and Filters", () => {
		const items = shareNavigation("/share/abc");
		expect(items.map(item => [item.label, item.to, item.keepsReportQuery])).toEqual([
			["Analytics", "/share/abc", true],
			["Pages", "/share/abc/pages", true],
			["Funnels", "/share/abc/funnels", true],
		]);
	});
});

describe("settings sections", () => {
	it("lists every Site Settings section under the Site's settings path", () => {
		const sections = siteSettingsSections("/app/acme/sites/site-1/settings");
		expect(sections.map(section => section.label)).toEqual(["Install", "Attribution", "Sharing", "Privacy", "Integrations", "Filtering", "Danger zone"]);
		expect(sections[0]!.to).toBe("/app/acme/sites/site-1/settings");
		expect(sections.at(-1)!.to).toBe("/app/acme/sites/site-1/settings/danger");
	});

	it("lists the Organization Settings sections", () => {
		const sections = organizationSettingsSections("/app/acme/settings", { email: true });
		expect(sections.map(section => [section.label, section.to])).toEqual([
			["General", "/app/acme/settings"],
			["Members", "/app/acme/settings/members"],
			["Digests", "/app/acme/settings/digests"],
			["Danger zone", "/app/acme/settings/danger"],
		]);
	});

	it("hides Digests on a server that sends no email", () => {
		const sections = organizationSettingsSections("/app/acme/settings", { email: false });
		expect(sections.map(section => section.label)).toEqual(["General", "Members", "Danger zone"]);
	});
});

describe("reportQueryOf", () => {
	it("keeps only the Range and Filters", () => {
		expect(reportQueryOf({ range: "custom", from: "2026-01-01", to: "2026-01-31", f: ["country:CH"], q: "pricing", tab: "x" })).toEqual({
			range: "custom",
			from: "2026-01-01",
			to: "2026-01-31",
			f: ["country:CH"],
		});
	});
});
