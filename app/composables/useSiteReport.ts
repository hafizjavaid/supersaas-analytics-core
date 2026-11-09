// `api` is the Site's report root: `/api/sites/:id` for Members, `/api/share/:token` on a Share link.
export function useSiteReport<T>(resource: MaybeRefOrGetter<string>, api: MaybeRefOrGetter<string>, query: MaybeRefOrGetter<ReportQuery>) {
	return useFetch<T>(() => `${toValue(api)}/${toValue(resource)}`, {
		query: computed(() => toValue(query)),
		lazy: true,
	});
}
