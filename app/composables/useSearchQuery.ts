import type { SearchEngine, SearchRangeKey } from "#layers/core/shared/utils/search";

// The Search pages keep their Range in `?range=`, with their own options since search engines report days late, and the
// Search page its engine in `?engine=`.
export function useSearchQuery() {
	const route = useRoute();
	const range = computed<SearchRangeKey>(() => (isSearchRange(route.query.range) ? route.query.range : "28d"));
	const engine = computed<SearchEngine | "all">(() => (isSearchEngine(route.query.engine) ? route.query.engine : "all"));
	return {
		range,
		engine,
		searchQuery: computed(() => ({ range: range.value, ...(engine.value === "all" ? {} : { engine: engine.value }) })),
		selectRange: (key: SearchRangeKey) => navigateTo({ query: { ...route.query, range: key } }),
		selectEngine: (key: SearchEngine | "all") => {
			const { engine: _engine, ...rest } = route.query;
			return navigateTo({ query: key === "all" ? rest : { ...rest, engine: key } });
		},
	};
}
