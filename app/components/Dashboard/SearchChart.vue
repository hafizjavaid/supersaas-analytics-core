<script setup lang="ts">
import type { SearchPoint } from "#layers/core/shared/types/search";
import type { SearchEngine } from "#layers/core/shared/utils/search";

const props = defineProps<{ points: SearchPoint[]; metric: "clicks" | "impressions" }>();

const colors = useThemeColors();
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const ENGINE_COLORS: Record<SearchEngine, "primary" | "info"> = { google: "primary", bing: "info" };

// One series per engine, stacked, so the top line is the total.
const option = computed(() => {
	const theme = colors.value;
	if (!theme) {
		return undefined;
	}
	const engines = [...new Set(props.points.map(point => point.engine))];
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
			valueFormatter: (value: number) => value.toLocaleString("en-US"),
		},
		xAxis: {
			type: "time",
			axisLine: { lineStyle: { color: theme.border } },
			axisTick: { show: false },
			axisLabel: { color: theme.text, hideOverlap: true, formatter: (value: number) => dayFormat.format(value) },
			splitLine: { show: false },
		},
		yAxis: {
			type: "value",
			min: 0,
			minInterval: 1,
			axisLabel: { color: theme.text, formatter: (value: number) => formatCompactNumber(value) },
			splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
		},
		series: engines.map(engine => ({
			name: SEARCH_ENGINE_NAMES[engine],
			type: "line",
			stack: "engines",
			showSymbol: false,
			smooth: 0.2,
			areaStyle: { opacity: 0.12 },
			data: props.points.filter(point => point.engine === engine).map(point => [Date.parse(`${point.date}T00:00:00Z`), point[props.metric]]),
			itemStyle: { color: theme[ENGINE_COLORS[engine]] },
			lineStyle: { width: 2, color: theme[ENGINE_COLORS[engine]] },
		})),
	};
});
</script>

<template>
	<div class="h-[240px]">
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
