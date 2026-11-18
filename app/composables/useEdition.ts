import type { TableColumn } from "@nuxt/ui";
import type { VNode } from "vue";
import type { AdminOrganization, AdminUser } from "#layers/core/shared/types/admin";
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";
import type { Filter } from "#layers/core/shared/utils/filters";

// Hosted's live demo: an Organization anyone may open, answered from recordings, so it reports only what was recorded
// and changes nothing.
export interface EditionDemo {
	// Guests get past the `auth` middleware on these paths.
	shows: (path: string) => boolean;
	// False for a page the demo has no recordings of, which the rail leaves out.
	offers: (path: string) => boolean;
	answersFilters: (path: string, filters: Filter[]) => boolean;
	signUp: () => void;
}

// What the Hosted layer adds to core's UI. Core's plugins/edition.ts provides these defaults, and the layer's plugin
// overrides fields of the same object.
export interface Edition {
	// Rail items after Settings, with `to` relative to the Organization.
	organizationNavigation: NavigationLink[];
	// On top of the role: whether the Organization may change what its Sites report.
	canChangeDashboard: (organization: OrganizationMembership, permission: OrganizationPermission, nowMs: number) => boolean;
	// Placed between the Organization column and Sites in the admin area's Organizations table.
	adminOrganizationColumns: TableColumn<AdminOrganization>[];
	// Admin pages after Database.
	adminNavigation: NavigationLink[];
	// Buttons after "Set password" on a row of the admin area's Users table.
	adminUserActions: (user: AdminUser) => VNode[];
	demo: EditionDemo;
}

export function coreEdition(): Edition {
	return {
		organizationNavigation: [],
		canChangeDashboard: () => true,
		adminOrganizationColumns: [],
		adminNavigation: [],
		adminUserActions: () => [],
		demo: { shows: () => false, offers: () => true, answersFilters: () => true, signUp: () => {} },
	};
}

export function useEdition(): Edition {
	return useNuxtApp().$edition;
}
