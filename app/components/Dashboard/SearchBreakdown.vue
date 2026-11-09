<script setup lang="ts">
import type { SearchBreakdowns } from "#layers/core/shared/types/search";
import { countryName } from "#layers/core/shared/utils/countries";

const props = defineProps<{ breakdowns: SearchBreakdowns; compact?: boolean }>();

const DEVICE_LABELS: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };

const columns = computed(() => [
	{
		title: "Pages",
		kind: "page" as const,
		items: props.breakdowns.pages.map(row => ({ key: row.value, label: row.value.replace(/^https?:\/\//, ""), detail: null, value: row.clicks })),
	},
	{
		title: "Countries",
		kind: "country" as const,
		items: props.breakdowns.countries.map(row => ({ key: row.value, label: row.value === "Unknown" ? "Unknown" : countryName(row.value), detail: null, value: row.clicks })),
	},
	{
		title: "Devices",
		kind: "device" as const,
		items: props.breakdowns.devices.map(row => ({ key: row.value, label: DEVICE_LABELS[row.value] ?? row.value, detail: null, value: row.clicks })),
	},
]);
</script>

<template>
	<template v-if="compact">
		<section
			v-for="column in columns"
			:key="column.title"
			:aria-label="column.title"
		>
			<h4 class="mb-1 px-2.5 text-xs font-medium text-muted">
				{{ column.title }}
			</h4>
			<DashboardRankedList
				:items="column.items"
				empty-label="No clicks"
			>
				<template #icon="{ item }">
					<DashboardCountryFlag
						v-if="column.kind === 'country'"
						:country="item.key"
					/>
					<DashboardDeviceIcon
						v-else-if="column.kind === 'device'"
						dimension="device"
						:value="item.key"
					/>
				</template>
			</DashboardRankedList>
		</section>
	</template>
	<template v-else>
		<UCard
			v-for="column in columns"
			:key="column.title"
			:ui="{ header: 'px-4 py-3 sm:px-4 text-sm font-medium flex justify-between', body: 'p-2.5 sm:p-2.5' }"
		>
			<template #header>
				Top {{ column.title.toLowerCase() }}
				<span class="font-normal text-muted">Clicks</span>
			</template>
			<DashboardRankedList
				:items="column.items"
				empty-label="No clicks in this Range"
			>
				<template #icon="{ item }">
					<DashboardCountryFlag
						v-if="column.kind === 'country'"
						:country="item.key"
					/>
					<DashboardDeviceIcon
						v-else-if="column.kind === 'device'"
						dimension="device"
						:value="item.key"
					/>
				</template>
			</DashboardRankedList>
		</UCard>
	</template>
</template>
