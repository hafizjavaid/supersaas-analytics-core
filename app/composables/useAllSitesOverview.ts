import type { AllSitesOverview } from "#layers/core/shared/types/analytics";

const REFRESH_INTERVAL_MS = 60_000;

export function allSitesOverviewKey(organizationSlug: string) {
	return `all-sites:${organizationSlug}`;
}

export function useAllSitesOverview() {
	const { organization } = useOrganization();
	const result = useFetch<AllSitesOverview>(() => `/api/organizations/${organization.value.id}/overview`, {
		key: computed(() => allSitesOverviewKey(organization.value.slug)),
		default: () => ({ totals: { visitors: 0, pageviews: 0, live: 0, previous: { visitors: 0, pageviews: 0 }, revenue: [], searchClicks: null }, sites: [] }),
	});

	const visibility = useDocumentVisibility();
	useIntervalFn(() => {
		if (visibility.value === "visible") {
			result.refresh();
		}
	}, REFRESH_INTERVAL_MS);

	return result;
}
