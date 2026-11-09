import type { TableColumn } from "@nuxt/ui";
import type { VNode } from "vue";
import type { AdminOrganization, AdminUser } from "#layers/core/shared/types/admin";
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

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
}

export function coreEdition(): Edition {
	return {
		organizationNavigation: [],
		canChangeDashboard: () => true,
		adminOrganizationColumns: [],
		adminNavigation: [],
		adminUserActions: () => [],
	};
}

export function useEdition(): Edition {
	return useNuxtApp().$edition;
}
