import type { LiveVisitors } from "#layers/core/shared/types/analytics";

const POLL_INTERVAL_MS = 15_000;

// Live visitors are polled from the database (ADR 0001); polling pauses while the tab is hidden.
export function useLiveVisitors(api: MaybeRefOrGetter<string | undefined>) {
	const live = ref<LiveVisitors | null>(null);
	const visibility = useDocumentVisibility();
	let requestId = 0;

	async function refresh() {
		const root = toValue(api);
		if (!root || visibility.value === "hidden") {
			return;
		}
		const currentRequest = ++requestId;
		try {
			const result = await $fetch<LiveVisitors>(`${root}/live`);
			if (currentRequest === requestId) {
				live.value = result;
			}
		}
		catch {
			// A missed poll is retried on the next tick.
		}
	}

	const { pause, resume } = useIntervalFn(refresh, POLL_INTERVAL_MS, { immediate: false });

	onMounted(() => {
		watch(() => toValue(api), () => {
			live.value = null;
			requestId++;
			pause();
			refresh();
			resume();
		}, { immediate: true });

		watch(visibility, (state) => {
			if (state === "visible") {
				refresh();
			}
		});
	});

	return live;
}
