<script setup lang="ts">
import type { SummaryWithPrevious, TimeseriesPoint } from "#layers/core/shared/types/analytics";
import type { ResolvedRange } from "#layers/core/shared/utils/dates";

const props = defineProps<{ api: string; query: ReportQuery; comparison: string }>();

const { data: summary } = useSiteReport<SummaryWithPrevious>("summary", () => props.api, () => props.query);
const { data: timeseries, pending } = useSiteReport<{ range: ResolvedRange; points: TimeseriesPoint[] }>("timeseries", () => props.api, () => props.query);

const selected = ref<DashboardMetric[]>([...DEFAULT_CHART_METRICS]);

const kpis = computed(() => shownMetrics(summary.value).map(metric => ({
	metric,
	value: metric.format(summary.value?.[metric.key] ?? 0, summary.value?.currency),
	change: summary.value ? metricChange(metric, summary.value, summary.value.previous) : null,
	previous: summary.value ? metric.format(summary.value.previous[metric.key] ?? 0, summary.value.currency) : null,
	active: selected.value.includes(metric.key),
})));

const hourly = computed(() => {
	const range = timeseries.value?.range;
	return !!range && (!!range.hours || range.fromDate === range.toDate);
});
</script>

<template>
	<UCard :ui="{ header: 'px-4 py-3 sm:px-4 text-sm font-medium', body: 'p-2.5 sm:p-2.5' }">
		<template #header>
			Overview
		</template>

		<div
			class="mb-3 grid grid-cols-2 gap-1"
			:class="kpis.length > 5 ? 'sm:grid-cols-3 lg:grid-cols-6' : kpis.length > 4 ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4'"
			role="group"
			aria-label="Chart series"
		>
			<button
				v-for="kpi in kpis"
				:key="kpi.metric.key"
				type="button"
				:aria-pressed="kpi.active"
				:title="kpi.previous === null ? undefined : `${kpi.previous} ${comparison}`"
				class="rounded-md px-3 py-2 text-left transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
				:class="kpi.active ? 'bg-elevated/50' : 'opacity-70'"
				@click="selected = toggleMetric(selected, kpi.metric.key)"
			>
				<span class="flex items-center gap-1.5 text-sm text-muted">
					<span
						class="size-2 rounded-full"
						:class="kpi.active ? kpi.metric.dotClass : 'bg-accented'"
					/>
					{{ kpi.metric.label }}
				</span>
				<span class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<span class="text-2xl font-semibold tabular-nums text-highlighted">{{ kpi.value }}</span>
					<span
						v-if="kpi.change"
						class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
						:class="CHANGE_PILL_CLASSES[kpi.change.tone]"
					>
						{{ kpi.change.label }}
					</span>
				</span>
			</button>
		</div>

		<USkeleton
			v-if="pending && !timeseries"
			class="h-[260px] w-full"
		/>
		<DashboardOverviewChart
			v-else
			:points="timeseries?.points ?? []"
			:metrics="selected"
			:hourly="hourly"
			:currency="summary?.currency"
		/>
	</UCard>
</template>
