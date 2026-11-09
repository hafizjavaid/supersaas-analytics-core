<script setup lang="ts">
import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming } from "@nuxt/ui/utils/ai";
import type { TimeseriesPoint } from "#layers/core/shared/types/analytics";

const props = defineProps<{ message: UIMessage }>();

const CHART_METRICS: DashboardMetric[] = ["visitors", "pageviews"];

const parts = computed(() => props.message.parts.map((part, index) => ({
	key: `${props.message.id}-${index}`,
	part,
	tool: isToolUIPart(part) ? toolPartView(part as ToolPart) : null,
})));

function chartPoints(points: Pick<TimeseriesPoint, "timestamp" | "visitors" | "pageviews">[]): TimeseriesPoint[] {
	return points.map(point => ({ ...point, bounceRate: 0, avgDurationSeconds: 0 }));
}
</script>

<template>
	<template
		v-for="{ key, part, tool } in parts"
		:key="key"
	>
		<template v-if="isTextUIPart(part)">
			<Comark
				v-if="message.role === 'assistant'"
				:markdown="part.text"
				:streaming="isPartStreaming(part)"
				class="*:first:mt-0 *:last:mb-0"
			/>
			<p
				v-else
				class="whitespace-pre-wrap"
			>
				{{ part.text }}
			</p>
		</template>

		<div
			v-else-if="tool?.kind === 'timeseries'"
			class="my-2 rounded-lg p-3 ring ring-default"
		>
			<p class="mb-1 text-xs font-medium text-muted">
				{{ tool.label }}
			</p>
			<DashboardOverviewChart
				:points="chartPoints(tool.points)"
				:metrics="CHART_METRICS"
				:hourly="tool.hourly"
			/>
		</div>

		<div
			v-else-if="tool?.kind === 'topList'"
			class="my-2 rounded-lg p-2.5 ring ring-default"
		>
			<p class="mb-1 flex justify-between px-2 text-xs font-medium text-muted">
				{{ tool.label }}
				<span class="font-normal capitalize">{{ tool.metric }}</span>
			</p>
			<DashboardRankedList
				:items="tool.rows"
				:total="tool.total"
			/>
		</div>

		<UChatTool
			v-else-if="tool"
			:text="tool.label"
			:loading="tool.kind === 'pending'"
			:icon="tool.kind === 'error' ? 'i-material-symbols-error-outline-rounded' : 'i-material-symbols-query-stats-rounded'"
			:class="{ 'text-error': tool.kind === 'error' }"
		/>
	</template>
</template>
