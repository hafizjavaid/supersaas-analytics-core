<script setup lang="ts">
import type { TopEventRow } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery }>();

const { data } = useSiteReport<{ rows: TopEventRow[] }>("activity", () => props.api, () => props.query);
const items = computed(() => (data.value?.rows ?? []).map(row => ({
	key: `${row.name}\u0000${row.path ?? ""}`,
	label: row.name,
	detail: row.path,
	value: row.count,
	row,
})));

const selected = ref<TopEventRow>();
const panelOpen = ref(false);

function openPanel(row: TopEventRow) {
	selected.value = row;
	panelOpen.value = true;
}
</script>

<template>
	<DashboardRankedCard title="Events">
		<DashboardRankedList
			:items="items"
			empty-label="No custom events yet"
			select-label="Break down"
			@select="item => openPanel(item.row)"
		/>
		<DashboardEventPropertiesPanel
			v-if="selected"
			v-model:open="panelOpen"
			:api="api"
			:query="query"
			:event="selected"
		/>
	</DashboardRankedCard>
</template>
