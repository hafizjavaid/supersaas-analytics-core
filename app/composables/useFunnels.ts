import type { Funnel } from "#layers/core/shared/types/analytics";

export function useFunnels(api: MaybeRefOrGetter<string>) {
	return useFetch<Funnel[]>(() => `${toValue(api)}/funnels`, {
		key: computed(() => `funnels:${toValue(api)}`),
		default: () => [],
	});
}
