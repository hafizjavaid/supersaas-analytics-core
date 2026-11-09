import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

export function useOrganizations() {
	return useFetch<OrganizationMembership[]>("/api/organizations", { key: "organizations", default: () => [] });
}
