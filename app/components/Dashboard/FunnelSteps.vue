<script setup lang="ts">
import type { FunnelReport } from "#layers/core/shared/utils/funnels";

const props = defineProps<{ report: FunnelReport }>();

const HATCHED = "repeating-linear-gradient(135deg, var(--ui-border-accented) 0 2px, transparent 2px 6px)";

const bars = computed(() => props.report.steps.map((result, index) => ({
	...result,
	key: `${index}-${result.step.kind}-${result.step.value}`,
	previousRate: index === 0 ? 1 : props.report.steps[index - 1]!.entryRate,
	icon: result.step.kind === "page" ? "i-material-symbols-description-outline-rounded" : "i-material-symbols-bolt-outline-rounded",
})));
</script>

<template>
	<ol
		class="flex flex-col"
		aria-label="Funnel steps"
	>
		<li
			v-for="(bar, index) in bars"
			:key="bar.key"
			class="flex flex-col"
		>
			<p
				v-if="index > 0"
				class="py-1.5 pl-2 text-xs text-muted tabular-nums"
			>
				{{ funnelTransition(bar) }}
			</p>
			<div class="flex items-center gap-2 text-sm">
				<UIcon
					:name="bar.icon"
					class="size-4 shrink-0 text-dimmed"
				/>
				<span class="min-w-0 truncate text-highlighted">{{ bar.label }}</span>
				<span
					v-if="bar.step.label"
					class="hidden min-w-0 shrink-[2] truncate font-mono text-xs text-dimmed sm:inline"
				>{{ bar.step.value }}</span>
				<span class="ml-auto shrink-0 font-medium text-highlighted tabular-nums">{{ bar.visitors.toLocaleString("en-US") }}</span>
				<span class="w-14 shrink-0 text-right text-muted tabular-nums">{{ formatPercent(bar.entryRate) }}</span>
			</div>
			<div class="relative mt-1 h-3 w-full overflow-hidden rounded-sm bg-elevated/50">
				<div
					class="absolute inset-y-0 left-0"
					:style="{ width: `${bar.previousRate * 100}%`, backgroundImage: HATCHED }"
				/>
				<div
					class="absolute inset-y-0 left-0 rounded-sm bg-primary"
					:style="{ width: `${bar.entryRate * 100}%` }"
				/>
			</div>
		</li>
	</ol>
</template>
