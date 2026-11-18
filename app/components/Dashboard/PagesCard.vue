<script setup lang="ts">
import type { PageDimension, TopPageRow } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery }>();

const TABS: DimensionTab<PageDimension>[] = [
	{ value: "top", label: "Top" },
	{ value: "entered", label: "Entered" },
	{ value: "exited", label: "Exited" },
	{ value: "outbound", label: "Outbound" },
];

const EMPTY_LABELS: Record<PageDimension, string> = {
	top: "No pageviews yet",
	entered: "No pageviews yet",
	exited: "No pageviews yet",
	outbound: "No outbound link clicks yet",
};

function hostname(url: string) {
	try {
		return new URL(url).hostname;
	}
	catch {
		return undefined;
	}
}

const { view, data, animate, changeView } = useRankedList<TopPageRow, PageDimension>("pages", props, "top");
const items = computed(() => (data.value?.rows ?? []).map((row) => {
	const filter = pageRowFilter(row, view.value);
	return {
		key: row.path,
		label: view.value === "outbound" ? row.path.replace(/^https?:\/\//, "") : row.path,
		value: row.count,
		linkDomain: view.value === "outbound" ? hostname(row.path) : undefined,
		filters: filter && [filter],
	};
}));
</script>

<template>
	<DashboardRankedCard
		title="Pages"
		:tabs="TABS"
		:view="view"
		@change="changeView"
	>
		<DashboardRankedList
			:items="items"
			:total="data?.total"
			:animate="animate"
			:empty-label="EMPTY_LABELS[view]"
		>
			<template #icon="{ item }">
				<DashboardSourceIcon
					v-if="item.linkDomain"
					:domain="item.linkDomain"
				/>
			</template>
		</DashboardRankedList>
	</DashboardRankedCard>
</template>
