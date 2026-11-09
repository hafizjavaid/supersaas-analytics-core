<script setup lang="ts">
import type { TimeseriesPoint } from "#layers/core/shared/types/analytics";

const props = defineProps<{ points: TimeseriesPoint[]; metrics: DashboardMetric[]; hourly: boolean; currency?: string | null }>();

const colors = useThemeColors();

const AXES: MetricAxis[] = ["count", "money", "rate", "duration", "conversion"];

const timeFormat = computed(() => new Intl.DateTimeFormat("en-US", props.hourly
	? { hour: "numeric" }
	: { month: "short", day: "numeric" }));

const option = computed(() => {
	const theme = colors.value;
	if (!theme) {
		return undefined;
	}
	const shown = DASHBOARD_METRICS.filter(metric => props.metrics.includes(metric.key));
	const labelledAxis = shown[0]?.axis ?? "count";
	const labelFormat: Record<MetricAxis, (value: number) => string> = {
		count: value => value.toLocaleString("en-US"),
		money: value => formatMoney(value, props.currency ?? "usd", { compact: true }),
		rate: value => formatPercent(value).replace(".0%", "%"),
		duration: formatDuration,
		conversion: value => formatPercent(value).replace(".0%", "%"),
	};
	return {
		aria: { enabled: true },
		animationDuration: 300,
		grid: { left: 8, right: 8, top: 12, bottom: 4, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
		tooltip: {
			trigger: "axis",
			backgroundColor: theme.background,
			borderColor: theme.border,
			textStyle: { color: theme.text, fontSize: 12 },
			axisPointer: { lineStyle: { color: theme.border } },
		},
		xAxis: {
			type: "time",
			axisLine: { lineStyle: { color: theme.border } },
			axisTick: { show: false },
			axisLabel: { color: theme.text, hideOverlap: true, formatter: (value: number) => timeFormat.value.format(value) },
			splitLine: { show: false },
		},
		// Rates and durations get their own scales; only the first shown series' axis is labelled, to keep the chart quiet.
		// Conversion rates are often a few percent, so their axis has no 100% ceiling.
		yAxis: AXES.map(axis => ({
			type: "value",
			show: axis === labelledAxis,
			min: 0,
			max: axis === "rate" ? 1 : undefined,
			minInterval: axis === "count" ? 1 : undefined,
			axisLabel: { color: theme.text, formatter: labelFormat[axis] },
			splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
		})),
		series: shown.map(metric => ({
			name: metric.label,
			type: "line",
			yAxisIndex: AXES.indexOf(metric.axis),
			showSymbol: false,
			smooth: 0.2,
			data: props.points.map(point => [point.timestamp, point[metric.key] ?? 0]),
			itemStyle: { color: theme[metric.themeColor] },
			lineStyle: { width: 2, color: theme[metric.themeColor] },
			tooltip: { valueFormatter: (value: number) => metric.axis === "count" ? value.toLocaleString("en-US") : metric.format(value, props.currency) },
		})),
	};
});
</script>

<template>
	<div class="h-[260px]">
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
