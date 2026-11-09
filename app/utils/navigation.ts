import type { LocationQuery } from "vue-router";

export interface NavigationLink {
	label: string;
	icon: string;
	to: string;
	exact?: boolean;
	// Report pages share the Range and Filters, so moving between them keeps `?range=` and `?f=`.
	keepsReportQuery?: boolean;
}

// Items for features that later tickets build stay listed, in rail order, and hidden until `built` is true.
interface PlannedLink extends NavigationLink {
	built: boolean;
	// Ask AI shows only once an Anthropic key is set.
	needsAi?: boolean;
}

function onlyBuilt(links: PlannedLink[], { ai = false } = {}): NavigationLink[] {
	return links
		.filter(link => link.built && (ai || !link.needsAi))
		.map(({ built: _built, needsAi: _needsAi, ...link }) => link);
}

interface SidebarOptions {
	organizationSlug: string;
	siteId?: string;
	ai?: boolean;
	organizationLinks?: NavigationLink[];
}

export function sidebarNavigation({ organizationSlug, siteId, ai = false, organizationLinks = [] }: SidebarOptions) {
	const organizationPath = `/app/${organizationSlug}`;
	if (!siteId) {
		return [...onlyBuilt([
			{ label: "Sites", icon: "i-material-symbols-grid-view-outline-rounded", to: organizationPath, exact: true, built: true },
			{ label: "Live", icon: "i-material-symbols-sensors-rounded", to: `${organizationPath}/live`, built: true },
			{ label: "Search", icon: "i-material-symbols-travel-explore-rounded", to: `${organizationPath}/search`, built: true },
			{ label: "Ask AI", icon: "i-material-symbols-auto-awesome-outline-rounded", to: `${organizationPath}/ask`, built: true, needsAi: true },
			{ label: "Settings", icon: "i-material-symbols-settings-outline-rounded", to: `${organizationPath}/settings`, built: true },
		], { ai }), ...organizationLinks.map(link => ({ ...link, to: `${organizationPath}/${link.to}` }))];
	}
	const sitePath = `${organizationPath}/sites/${siteId}`;
	return onlyBuilt([
		{ label: "All sites", icon: "i-material-symbols-arrow-back-rounded", to: organizationPath, exact: true, built: true },
		{ label: "Analytics", icon: "i-material-symbols-bar-chart-rounded", to: sitePath, exact: true, keepsReportQuery: true, built: true },
		{ label: "Live", icon: "i-material-symbols-sensors-rounded", to: `${sitePath}/live`, built: true },
		{ label: "Pages", icon: "i-material-symbols-description-outline-rounded", to: `${sitePath}/pages`, keepsReportQuery: true, built: true },
		{ label: "Users", icon: "i-material-symbols-group-outline-rounded", to: `${sitePath}/users`, keepsReportQuery: true, built: true },
		{ label: "Journeys", icon: "i-material-symbols-account-tree-outline-rounded", to: `${sitePath}/journeys`, keepsReportQuery: true, built: true },
		{ label: "Funnels", icon: "i-material-symbols-conversion-path-rounded", to: `${sitePath}/funnels`, keepsReportQuery: true, built: true },
		{ label: "Conversions", icon: "i-material-symbols-payments-outline-rounded", to: `${sitePath}/conversions`, keepsReportQuery: true, built: true },
		{ label: "Links", icon: "i-material-symbols-link-rounded", to: `${sitePath}/links`, keepsReportQuery: true, built: true },
		{ label: "Search", icon: "i-material-symbols-travel-explore-rounded", to: `${sitePath}/search`, built: true },
		{ label: "Insights", icon: "i-material-symbols-lightbulb-outline-rounded", to: `${sitePath}/insights`, built: true },
		{ label: "Ask AI", icon: "i-material-symbols-auto-awesome-outline-rounded", to: `${sitePath}/ask`, built: true, needsAi: true },
		{ label: "Settings", icon: "i-material-symbols-settings-outline-rounded", to: `${sitePath}/settings`, built: true },
	], { ai });
}

export function adminNavigation(editionLinks: NavigationLink[] = []): NavigationLink[] {
	return [...onlyBuilt([
		{ label: "Back to the app", icon: "i-material-symbols-arrow-back-rounded", to: "/app", exact: true, built: true },
		{ label: "Users", icon: "i-material-symbols-person-outline-rounded", to: "/app/admin", exact: true, built: true },
		{ label: "Organizations", icon: "i-material-symbols-corporate-fare-rounded", to: "/app/admin/organizations", built: true },
		{ label: "Database", icon: "i-material-symbols-database-outline", to: "/app/admin/database", built: true },
	]), ...editionLinks];
}

export function shareNavigation(sharePath: string): NavigationLink[] {
	return onlyBuilt([
		{ label: "Analytics", icon: "i-material-symbols-bar-chart-rounded", to: sharePath, exact: true, keepsReportQuery: true, built: true },
		{ label: "Pages", icon: "i-material-symbols-description-outline-rounded", to: `${sharePath}/pages`, keepsReportQuery: true, built: true },
		{ label: "Funnels", icon: "i-material-symbols-conversion-path-rounded", to: `${sharePath}/funnels`, keepsReportQuery: true, built: true },
		{ label: "Search", icon: "i-material-symbols-travel-explore-rounded", to: `${sharePath}/search`, keepsReportQuery: true, built: false },
	]);
}

export function siteSettingsSections(settingsPath: string): NavigationLink[] {
	return [
		{ label: "Install", icon: "i-material-symbols-code-rounded", to: settingsPath, exact: true },
		{ label: "Attribution", icon: "i-material-symbols-payments-outline-rounded", to: `${settingsPath}/attribution` },
		{ label: "Sharing", icon: "i-material-symbols-share-outline", to: `${settingsPath}/sharing` },
		{ label: "Privacy", icon: "i-material-symbols-shield-outline-rounded", to: `${settingsPath}/privacy` },
		{ label: "Integrations", icon: "i-material-symbols-extension-outline", to: `${settingsPath}/integrations` },
		{ label: "Filtering", icon: "i-material-symbols-filter-list-rounded", to: `${settingsPath}/filtering` },
		{ label: "Danger zone", icon: "i-material-symbols-warning-outline-rounded", to: `${settingsPath}/danger` },
	];
}

export function organizationSettingsSections(settingsPath: string, { email }: { email: boolean }): NavigationLink[] {
	return [
		{ label: "General", icon: "i-material-symbols-tune-rounded", to: settingsPath, exact: true },
		{ label: "Members", icon: "i-material-symbols-group-outline-rounded", to: `${settingsPath}/members` },
		...(email ? [{ label: "Digests", icon: "i-material-symbols-mail-outline-rounded", to: `${settingsPath}/digests` }] : []),
		{ label: "Danger zone", icon: "i-material-symbols-warning-outline-rounded", to: `${settingsPath}/danger` },
	];
}

const REPORT_QUERY_KEYS = ["range", "from", "to", "f"];

export function reportQueryOf(query: LocationQuery): LocationQuery {
	return Object.fromEntries(Object.entries(query).filter(([key]) => REPORT_QUERY_KEYS.includes(key)));
}

export function withReportQuery(links: NavigationLink[], query: LocationQuery) {
	return links.map(({ keepsReportQuery, ...link }) => (keepsReportQuery ? { ...link, to: { path: link.to, query: reportQueryOf(query) } } : link));
}
