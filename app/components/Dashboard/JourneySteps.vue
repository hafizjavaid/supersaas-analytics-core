<script setup lang="ts">
import type { JourneyStep } from "#layers/core/shared/types/analytics";

defineProps<{ steps: JourneyStep[]; timezone: string }>();

const STEP_ICONS: Record<JourneyStep["type"], string> = {
	pageview: "i-material-symbols-description-outline-rounded",
	event: "i-material-symbols-bolt-outline-rounded",
	outbound: "i-material-symbols-open-in-new-rounded",
};
</script>

<template>
	<ol class="grid gap-0.5 border-l border-default pl-4">
		<li
			v-for="(step, index) in steps"
			:key="`${step.type}-${step.timestamp}-${index}`"
			class="relative flex items-start gap-3 py-1.5 text-sm"
		>
			<UIcon
				:name="STEP_ICONS[step.type]"
				class="absolute top-2 -left-6 size-4 rounded-full bg-default text-muted"
			/>
			<span class="w-11 shrink-0 font-mono text-xs/5 text-muted tabular-nums">{{ formatClock(step.timestamp, timezone) }}</span>
			<div
				v-if="step.type === 'pageview'"
				class="min-w-0 flex-1"
			>
				<div class="flex items-center gap-2">
					<span class="truncate font-mono text-highlighted">{{ step.path }}</span>
					<UBadge
						v-if="step.entry"
						label="ENTRY"
						size="sm"
						color="primary"
						variant="subtle"
					/>
				</div>
				<p class="truncate text-xs text-muted">
					{{ step.title || "Untitled" }}<template v-if="step.timeOnPageSeconds !== null">
						· {{ formatDuration(step.timeOnPageSeconds) }} on page
					</template>
				</p>
			</div>
			<div
				v-else-if="step.type === 'event'"
				class="min-w-0 flex-1"
			>
				<p class="truncate">
					<span class="font-medium text-highlighted">{{ step.name }}</span>
					<span
						v-if="step.path"
						class="ml-1.5 font-mono text-xs text-muted"
					>{{ step.path }}</span>
				</p>
				<div
					v-if="step.props"
					class="mt-1 flex flex-wrap gap-1"
				>
					<UBadge
						v-for="[key, value] in journeyPropEntries(step.props)"
						:key="key"
						:label="`${key}: ${value}`"
						size="sm"
						color="neutral"
						variant="outline"
						class="font-mono"
					/>
				</div>
			</div>
			<div
				v-else
				class="min-w-0 flex-1"
			>
				<p class="text-xs text-muted">
					Outbound link
				</p>
				<p class="truncate font-mono text-highlighted">
					{{ step.url }}
				</p>
			</div>
		</li>
		<slot />
	</ol>
</template>
