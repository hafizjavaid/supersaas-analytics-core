<script setup lang="ts">
import type { Digest } from "#layers/core/shared/types/digests";

const props = defineProps<{ digest: Digest }>();

const figureRows = computed(() => digestFigureRows(props.digest.report.figures, props.digest.report.currency));
const moverLists = computed(() => [
	{ title: "Pages that moved most", unit: "pageviews", icon: "i-material-symbols-description-outline-rounded", movers: props.digest.report.pages },
	{ title: "Sources that moved most", unit: "visits", icon: "i-material-symbols-travel-explore-rounded", movers: props.digest.report.sources },
]);

function pillClass(improved: boolean | null) {
	return CHANGE_PILL_CLASSES[improved === null ? "neutral" : improved ? "success" : "error"];
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<UCard
			v-if="digest.summary"
			variant="subtle"
		>
			<div class="flex gap-3">
				<UIcon
					name="i-material-symbols-auto-awesome-outline-rounded"
					class="mt-0.5 size-5 shrink-0 text-primary"
				/>
				<p class="text-sm/6 text-default">
					{{ digest.summary }}
				</p>
			</div>
		</UCard>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
			<div
				v-for="row in figureRows"
				:key="row.label"
				class="flex flex-col gap-1 rounded-lg border border-default p-4"
			>
				<span class="text-xs text-muted">{{ row.label }}</span>
				<span class="text-xl font-semibold text-highlighted tabular-nums">{{ row.current }}</span>
				<span class="flex items-center gap-2 text-xs text-muted">
					<span
						class="rounded px-1.5 py-0.5 font-medium tabular-nums"
						:class="pillClass(row.improved)"
					>{{ row.change ?? "new" }}</span>
					was {{ row.previous }}
				</span>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<UCard
				v-for="list in moverLists"
				:key="list.title"
				:ui="{ body: 'p-0 sm:p-0' }"
			>
				<template #header>
					<h3 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
						<UIcon
							:name="list.icon"
							class="size-4 text-muted"
						/>
						{{ list.title }}
					</h3>
				</template>
				<ul
					v-if="list.movers.length"
					class="divide-y divide-default"
				>
					<li
						v-for="mover in list.movers"
						:key="mover.label"
						class="flex items-center gap-3 px-4 py-2 text-sm"
					>
						<span class="min-w-0 flex-1 truncate font-mono text-default">{{ mover.label }}</span>
						<span class="text-muted tabular-nums">{{ formatCount(mover.current) }} {{ list.unit }}</span>
						<span
							class="w-16 text-right font-medium tabular-nums"
							:class="mover.current > mover.previous ? 'text-success' : 'text-error'"
						>{{ formatMoverChange(mover) }}</span>
					</li>
				</ul>
				<p
					v-else
					class="px-4 py-3 text-sm text-muted"
				>
					Nothing changed.
				</p>
			</UCard>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<UCard :ui="{ body: 'p-0 sm:p-0' }">
				<template #header>
					<h3 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
						<UIcon
							name="i-material-symbols-fiber-new-outline-rounded"
							class="size-4 text-muted"
						/>
						New Sources
					</h3>
				</template>
				<ul
					v-if="digest.report.newSources.length"
					class="divide-y divide-default"
				>
					<li
						v-for="source in digest.report.newSources"
						:key="source.label"
						class="flex items-center gap-3 px-4 py-2 text-sm"
					>
						<DashboardSourceIcon :domain="source.label" />
						<span class="min-w-0 flex-1 truncate text-default">{{ source.label }}</span>
						<span class="text-muted tabular-nums">{{ formatCount(source.visits) }} visits</span>
					</li>
				</ul>
				<p
					v-else
					class="px-4 py-3 text-sm text-muted"
				>
					No referrer sent its first visit in this period.
				</p>
			</UCard>

			<UCard
				v-if="digest.report.goals.length"
				:ui="{ body: 'p-0 sm:p-0' }"
			>
				<template #header>
					<h3 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
						<UIcon
							name="i-material-symbols-flag-outline-rounded"
							class="size-4 text-muted"
						/>
						Goals
					</h3>
				</template>
				<ul class="divide-y divide-default">
					<li
						v-for="goal in digest.report.goals"
						:key="goal.name"
						class="flex items-center gap-3 px-4 py-2 text-sm"
					>
						<span class="min-w-0 flex-1 truncate text-default">{{ goal.name }}</span>
						<span class="text-highlighted tabular-nums">{{ formatCount(goal.conversions.current) }}</span>
						<span class="text-muted tabular-nums">was {{ formatCount(goal.conversions.previous) }}</span>
					</li>
				</ul>
			</UCard>
		</div>
	</div>
</template>
