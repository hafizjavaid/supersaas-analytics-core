import type { TopListResult } from "#layers/core/shared/types/analytics";

export interface DimensionTab<TValue extends string> {
	value: TValue;
	label?: string;
	icon?: string;
	ariaLabel?: string;
}

// Rows animate in only when the owner clicked a Dimension tab, not on the first load or a Range or Site change.
export function useRankedList<TRow, TView extends string>(resource: string, props: { api: string; query: ReportQuery }, initialView: TView) {
	const view = ref(initialView) as Ref<TView>;
	const animate = ref(false);
	let animateNextResult = false;

	const { data } = useSiteReport<TopListResult<TRow>>(resource, () => props.api, () => ({ ...props.query, view: view.value }));

	watch(data, () => {
		animate.value = animateNextResult;
		animateNextResult = false;
	});

	function changeView(next: TView, byPointer: boolean) {
		animateNextResult = byPointer;
		view.value = next;
	}

	return { view, data, animate, changeView };
}
