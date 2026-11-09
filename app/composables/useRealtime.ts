import type { Realtime } from "#layers/core/shared/types/analytics";

const POLL_INTERVAL_MS = 15_000;

// Polled like Live visitors (ADR 0001), and paused while the tab is hidden.
export function useRealtime(path: MaybeRefOrGetter<string>, { server = true }: { server?: boolean } = {}) {
	const result = useFetch<Realtime>(() => toValue(path), {
		key: computed(() => `realtime:${toValue(path)}`),
		default: () => EMPTY_REALTIME,
		server,
	});

	const visibility = useDocumentVisibility();
	useIntervalFn(() => {
		if (visibility.value === "visible") {
			result.refresh();
		}
	}, POLL_INTERVAL_MS);
	watch(visibility, (state) => {
		if (state === "visible") {
			result.refresh();
		}
	});

	return result;
}
