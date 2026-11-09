<script setup lang="ts">
import type { FunnelReport } from "#layers/core/shared/utils/funnels";

const props = defineProps<{ report: FunnelReport }>();

const tiles = computed(() => [
	{ label: "Entered", value: props.report.entered.toLocaleString("en-US") },
	{ label: "Completed", value: props.report.completed.toLocaleString("en-US") },
	{ label: "Conv. rate", value: formatPercent(props.report.conversionRate) },
]);
</script>

<template>
	<div class="flex flex-col gap-4">
		<dl class="grid grid-cols-3 gap-1">
			<div
				v-for="tile in tiles"
				:key="tile.label"
				class="rounded-md bg-elevated/40 px-3 py-2"
			>
				<dt class="text-xs text-muted">
					{{ tile.label }}
				</dt>
				<dd class="mt-0.5 text-xl font-semibold text-highlighted tabular-nums">
					{{ tile.value }}
				</dd>
			</div>
		</dl>
		<DashboardFunnelSteps :report="report" />
	</div>
</template>
