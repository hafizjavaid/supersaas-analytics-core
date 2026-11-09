<script setup lang="ts">
import type { Realtime } from "#layers/core/shared/types/analytics";

const props = withDefaults(defineProps<{ realtime: Realtime; showSite?: boolean }>(), { showSite: false });
const hovered = defineModel<string | null>("hovered", { default: null });

const chipGroups = computed(() => realtimeChipGroups(props.realtime));
const sparkline = computed(() => props.realtime.pageviews.points.map(point => point.pageviews));
</script>

<template>
	<div class="flex min-h-0 flex-col gap-5">
		<div>
			<p class="flex items-center gap-2 text-2xl font-semibold text-highlighted">
				<span
					class="size-2.5 rounded-full"
					:class="realtime.count > 0 ? 'animate-pulse bg-success' : 'bg-accented'"
				/>
				<span class="tabular-nums">{{ realtime.count }} live</span>
			</p>
			<p class="mt-1 text-sm text-muted">
				Visitors seen in the last 5 minutes
			</p>
		</div>

		<div>
			<div class="flex items-baseline justify-between gap-2">
				<p class="text-sm text-muted">
					Pageviews · last 30 minutes
				</p>
				<p class="text-xs text-muted">
					Peak <span class="font-medium tabular-nums text-highlighted">{{ realtime.pageviews.peak }}</span>/min
				</p>
			</div>
			<div class="mt-1 flex items-end justify-between gap-3">
				<span class="text-xl font-semibold tabular-nums text-highlighted">{{ realtime.pageviews.total }}</span>
				<DashboardSparkline
					:values="sparkline"
					:width="160"
					:height="32"
					label="Pageviews per minute over the last 30 minutes"
				/>
			</div>
		</div>

		<div
			v-for="group in chipGroups"
			:key="group.key"
		>
			<p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
				{{ group.label }}
			</p>
			<div
				v-if="group.chips.length"
				class="flex flex-wrap gap-1.5"
			>
				<UBadge
					v-for="chip in group.chips"
					:key="chip.value"
					color="neutral"
					variant="soft"
					class="gap-1.5"
				>
					<DashboardSourceIcon
						v-if="group.key === 'referrers'"
						:domain="chip.value"
						class="size-4"
					/>
					<DashboardCountryFlag
						v-else-if="group.key === 'countries'"
						:country="chip.value"
						class="size-4"
					/>
					<DashboardDeviceIcon
						v-else
						dimension="device"
						:value="chip.value"
						class="size-4"
					/>
					{{ chip.label }}
					<span class="tabular-nums text-muted">{{ chip.count }}</span>
				</UBadge>
			</div>
			<p
				v-else
				class="text-sm text-dimmed"
			>
				–
			</p>
		</div>

		<div class="flex min-h-0 flex-1 flex-col">
			<p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
				Current visitors
			</p>
			<p
				v-if="!realtime.visitors.length"
				class="text-sm text-dimmed"
			>
				No visitors right now
			</p>
			<ul
				v-else
				class="-mx-2 flex min-h-0 flex-col overflow-y-auto"
				aria-label="Current visitors"
			>
				<li
					v-for="visitor in realtime.visitors"
					:key="visitor.id"
					tabindex="0"
					class="flex flex-col gap-1 rounded-md px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
					:class="hovered === visitor.id ? 'bg-elevated' : 'hover:bg-elevated/60'"
					:aria-label="`${visitor.label} on ${visitor.path ?? 'an unknown page'}`"
					@mouseenter="hovered = visitor.id"
					@mouseleave="hovered = null"
					@focus="hovered = visitor.id"
					@blur="hovered = null"
				>
					<div class="flex min-w-0 items-center gap-2">
						<span class="min-w-0 flex-1 truncate font-mono text-sm text-highlighted">{{ visitor.path ?? "–" }}</span>
						<UBadge
							v-if="showSite"
							color="neutral"
							variant="outline"
							size="sm"
							class="max-w-32 shrink-0"
							:title="visitor.site.domain"
						>
							<span class="truncate">{{ visitor.site.name }}</span>
						</UBadge>
					</div>
					<div class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
						<DashboardCountryFlag
							:country="visitor.location?.country ?? ''"
							class="size-4"
						/>
						<span class="truncate">{{ placeLabel(visitor.location) }}</span>
						<template v-if="visitor.device">
							<span aria-hidden="true">·</span>
							<DashboardDeviceIcon
								dimension="browser"
								:value="visitor.device.browser"
								class="size-4"
							/>
							<span class="sr-only">{{ visitor.device.browser }}</span>
							<DashboardDeviceIcon
								dimension="device"
								:value="visitor.device.deviceType"
								class="size-4"
							/>
							<span class="sr-only">{{ visitor.device.deviceType }}</span>
						</template>
						<span aria-hidden="true">·</span>
						<DashboardSourceIcon
							:domain="visitor.source?.referrerDomain ?? ''"
							class="size-4"
						/>
						<span class="truncate">{{ sourceLabel(visitor.source) }}</span>
					</div>
				</li>
			</ul>
		</div>
	</div>
</template>
