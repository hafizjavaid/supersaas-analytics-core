<script setup lang="ts">
import type { DeviceDimension, TopDeviceRow } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery }>();

const TABS: DimensionTab<DeviceDimension>[] = [
	{ value: "browser", label: "Browsers" },
	{ value: "os", label: "OS" },
	{ value: "device", label: "Devices" },
];

const { view, data, animate, changeView } = useRankedList<TopDeviceRow, DeviceDimension>("devices", props, "browser");
const items = computed(() => (data.value?.rows ?? []).map(row => ({
	key: row.value,
	label: view.value === "device" ? `${row.value.charAt(0).toUpperCase()}${row.value.slice(1)}` : row.value,
	value: row.visits,
	filters: [{ dimension: view.value, value: row.value }],
})));
</script>

<template>
	<DashboardRankedCard
		title="Devices"
		:tabs="TABS"
		:view="view"
		@change="changeView"
	>
		<DashboardRankedList
			:items="items"
			:total="data?.total"
			:animate="animate"
		>
			<template #icon="{ item }">
				<DashboardDeviceIcon
					:dimension="view"
					:value="item.key"
				/>
			</template>
		</DashboardRankedList>
	</DashboardRankedCard>
</template>
