import type { RangeKey } from "#layers/core/shared/utils/dates";
import type { Filter, FilterDimension } from "#layers/core/shared/utils/filters";

export function useDashboardQuery() {
	const route = useRoute();

	const range = computed(() => readDashboardRange(route.query));
	const filters = computed(() => parseFilters(route.query.f));
	const reportQuery = computed(() => ({ ...rangeReportQuery(range.value), ...filtersReportQuery(filters.value) }));

	function withoutCustomDates() {
		const { from: _from, to: _to, ...rest } = route.query;
		return rest;
	}

	function setFilters(next: Filter[]) {
		const { f: _f, ...rest } = route.query;
		return navigateTo({ query: next.length > 0 ? { ...rest, f: next.map(serializeFilter) } : rest });
	}

	return {
		range,
		filters,
		reportQuery,
		selectRange: (key: Exclude<RangeKey, "custom">) => navigateTo({ query: { ...withoutCustomDates(), range: key } }),
		selectCustomRange: (from: string, to: string) => navigateTo({ query: { ...route.query, range: "custom", from, to } }),
		addFilters: (added: Filter[]) => setFilters(added.reduce(withFilter, filters.value)),
		removeFilter: (dimension: FilterDimension) => setFilters(withoutFilter(filters.value, dimension)),
		clearFilters: () => setFilters([]),
	};
}
