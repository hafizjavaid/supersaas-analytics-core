<script setup lang="ts">
import type { Realtime } from "#layers/core/shared/types/analytics";

const props = defineProps<{ realtime: Realtime; to: string }>();

const VISIBLE_VISITORS = 5;

const sparkline = computed(() => props.realtime.pageviews.points.map(point => point.pageviews));
const visitors = computed(() => props.realtime.visitors.slice(0, VISIBLE_VISITORS));
</script>

<template>
	<UCard :ui="{ header: 'px-4 py-2 sm:px-4', body: 'p-4 sm:p-4' }">
		<template #header>
			<div class="flex items-center justify-between gap-2">
				<span class="text-sm font-medium">Realtime</span>
				<ULink
					:to="to"
					class="text-sm text-primary hover:underline"
				>
					View realtime →
				</ULink>
			</div>
		</template>

		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="flex items-center gap-2 text-xl font-semibold text-highlighted">
						<span
							class="size-2 rounded-full"
							:class="realtime.count > 0 ? 'animate-pulse bg-success' : 'bg-accented'"
						/>
						<span class="tabular-nums">{{ realtime.count }}</span>
						<span class="text-sm font-normal text-muted">{{ realtime.count === 1 ? "visitor" : "visitors" }} online</span>
					</p>
					<p class="mt-1 text-xs text-muted">
						<span class="tabular-nums">{{ realtime.pageviews.total }}</span> pageviews · last 30 min · peak
						<span class="tabular-nums">{{ realtime.pageviews.peak }}</span>/min
					</p>
				</div>
				<DashboardSparkline
					:values="sparkline"
					:width="120"
					:height="28"
					label="Pageviews per minute over the last 30 minutes"
				/>
			</div>

			<p
				v-if="!visitors.length"
				class="text-sm text-dimmed"
			>
				No visitors right now
			</p>
			<ul
				v-else
				class="flex flex-col divide-y divide-default"
				aria-label="Current visitors"
			>
				<li
					v-for="visitor in visitors"
					:key="visitor.id"
					class="flex min-w-0 items-center gap-2 py-1.5 text-sm"
				>
					<DashboardCountryFlag
						:country="visitor.location?.country ?? ''"
						class="size-4"
					/>
					<span class="min-w-0 flex-1 truncate font-mono text-highlighted">{{ visitor.path ?? "–" }}</span>
					<span class="hidden truncate text-xs text-muted sm:inline">{{ placeLabel(visitor.location) }}</span>
					<DashboardDeviceIcon
						v-if="visitor.device"
						dimension="browser"
						:value="visitor.device.browser"
						class="size-4"
					/>
					<DashboardSourceIcon
						:domain="visitor.source?.referrerDomain ?? ''"
						class="size-4"
					/>
				</li>
			</ul>
		</div>
	</UCard>
</template>
