<script setup lang="ts">
import type { RevenuePoint } from "#layers/core/shared/types/revenue";

const props = defineProps<{ points: RevenuePoint[]; currency: string; hourly: boolean }>();

const colors = useThemeColors();

const timeFormat = computed(() => new Intl.DateTimeFormat("en-US", props.hourly
	? { hour: "numeric" }
	: { month: "short", day: "numeric" }));

const option = computed(() => {
	const theme = colors.value;
	if (!theme) {
		return undefined;
	}
	return {
		aria: { enabled: true },
		animationDuration: 300,
		grid: { left: 8, right: 8, top: 12, bottom: 4, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
		tooltip: {
			trigger: "axis",
			backgroundColor: theme.background,
			borderColor: theme.border,
			textStyle: { color: theme.text, fontSize: 12 },
			axisPointer: { type: "shadow" },
			formatter: (params: { dataIndex: number }[]) => {
				const point = props.points[params[0]?.dataIndex ?? -1];
				if (!point) {
					return "";
				}
				const payments = `${point.payments} ${point.payments === 1 ? "Payment" : "Payments"}`;
				return `${timeFormat.value.format(point.timestamp)}<br>${formatMoney(point.revenue, props.currency)} · ${payments}`;
			},
		},
		xAxis: {
			type: "time",
			axisLine: { lineStyle: { color: theme.border } },
			axisTick: { show: false },
			axisLabel: { color: theme.text, hideOverlap: true, formatter: (value: number) => timeFormat.value.format(value) },
			splitLine: { show: false },
		},
		yAxis: {
			type: "value",
			min: 0,
			axisLabel: { color: theme.text, formatter: (value: number) => formatMoney(value, props.currency, { compact: true }) },
			splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
		},
		series: [{
			name: "Revenue",
			type: "bar",
			barMaxWidth: 24,
			data: props.points.map(point => [point.timestamp, point.revenue]),
			itemStyle: { color: theme.success, borderRadius: [3, 3, 0, 0] },
		}],
	};
});
</script>

<template>
	<div class="h-[220px]">
		<ClientOnly>
			<VChart
				v-if="option"
				:option="option"
				:update-options="{ notMerge: true }"
				autoresize
			/>
			<template #fallback>
				<USkeleton class="size-full" />
			</template>
		</ClientOnly>
	</div>
</template>
