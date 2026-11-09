<script setup lang="ts">
import type { GoalConversion, GoalReport } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery; settingsTo?: string; canManage?: boolean }>();

const { data } = useSiteReport<GoalReport>("goal-conversions", () => props.api, () => props.query);
const { filters, addFilters, removeFilter } = useDashboardQuery();

const selectedValue = computed(() => filters.value.find(filter => filter.dimension === "goal")?.value);
const rows = computed(() => (data.value?.goals ?? []).map(row => ({
	...row,
	selected: goalFilter(row.goal).value === selectedValue.value,
})));
const maxRate = computed(() => Math.max(0.0001, ...rows.value.map(row => row.conversionRate)));

function choose(row: GoalConversion & { selected: boolean }) {
	return row.selected ? removeFilter("goal") : addFilters([goalFilter(row.goal)]);
}
</script>

<template>
	<DashboardRankedCard
		title="Goals"
		:ui="{ body: 'p-2.5 sm:p-2.5' }"
	>
		<div
			v-if="data && rows.length === 0"
			class="flex flex-col items-center justify-center gap-3 py-10 text-center"
		>
			<p class="text-sm text-muted">
				No goals yet. Mark the Events or pages that matter to see their conversion rates.
			</p>
			<UButton
				v-if="canManage"
				label="Set up goals"
				icon="i-material-symbols-flag-outline-rounded"
				color="neutral"
				variant="outline"
				size="sm"
				:to="settingsTo"
			/>
		</div>

		<div
			v-else-if="rows.length > 0"
			class="flex flex-col gap-0.5"
		>
			<div class="flex items-center gap-2 px-2 pb-1 text-xs text-dimmed">
				<span class="flex-1">Goal</span>
				<span class="w-16 text-right">Uniques</span>
				<span class="hidden w-16 text-right sm:block">Total</span>
				<span class="w-16 text-right">CR</span>
			</div>
			<button
				v-for="row in rows"
				:key="row.goal.id"
				type="button"
				:title="row.selected ? `Stop filtering by ${row.goal.name}` : `Filter by ${row.goal.name}`"
				:aria-pressed="row.selected"
				class="relative flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-muted transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
				:class="row.selected ? 'ring-1 ring-primary' : ''"
				@click="choose(row)"
			>
				<div
					class="absolute inset-y-0 left-0 rounded-md bg-success/10"
					:style="{ width: `${Math.max(3, (row.conversionRate / maxRate) * 100)}%` }"
				/>
				<div class="relative flex min-w-0 flex-1 items-center gap-2">
					<span class="truncate tracking-wide text-default">{{ row.goal.name }}</span>
					<span
						v-if="row.goal.kind !== 'outbound' && row.goal.name !== row.goal.value && row.goal.name !== describeGoal(row.goal)"
						class="hidden min-w-0 shrink-[2] truncate font-mono text-xs text-dimmed sm:inline"
					>{{ row.goal.value }}</span>
				</div>
				<span class="relative w-16 text-right font-medium text-highlighted tabular-nums">{{ row.visitors.toLocaleString("en-US") }}</span>
				<span class="relative hidden w-16 text-right tabular-nums sm:block">{{ row.conversions.toLocaleString("en-US") }}</span>
				<span class="relative w-16 text-right font-medium text-highlighted tabular-nums">{{ formatPercent(row.conversionRate) }}</span>
			</button>
			<div class="mt-2 flex items-center justify-between gap-2 px-2 text-xs text-muted">
				<span>{{ formatPercent(data?.conversionRate ?? 0) }} of Visitors completed a goal</span>
				<ULink
					v-if="canManage"
					:to="settingsTo"
					class="text-muted hover:text-default"
				>
					Manage goals
				</ULink>
			</div>
		</div>

		<USkeleton
			v-else
			class="h-32 w-full"
		/>
	</DashboardRankedCard>
</template>
