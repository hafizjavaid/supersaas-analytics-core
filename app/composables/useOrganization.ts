import type { InjectionKey, Ref } from "vue";
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

interface OrganizationContext {
	organization: Ref<OrganizationMembership>;
	refresh: () => Promise<void>;
}

const organizationKey: InjectionKey<OrganizationContext> = Symbol("organization");

export function provideOrganization(context: OrganizationContext) {
	provide(organizationKey, context);
}

// AppPanel also renders on Share links, which have no Organization.
export function hasOrganization() {
	return inject(organizationKey, null) !== null;
}

// Pages under `/app/[organization]` render inside `pages/app/[organization].vue`, which loads and provides it.
export function useOrganization() {
	const context = inject(organizationKey);
	if (!context) {
		throw new Error("useOrganization() needs pages/app/[organization].vue as an ancestor");
	}
	const { organization } = context;
	const { canChangeDashboard } = useEdition();
	// Ticks so that a change the edition allows only for a time (Hosted's Trial) is refused once that time is up.
	const now = useNow({ interval: 60_000 });
	return {
		...context,
		basePath: computed(() => `/app/${organization.value.slug}`),
		// Mirrors the server's role check and `serverEdition().assertCanChange`.
		can: (permission: OrganizationPermission) => roleCan(organization.value.role, permission)
			&& canChangeDashboard(organization.value, permission, now.value.getTime()),
	};
}
