<script setup lang="ts">
import type { SiteOverview } from "#layers/core/shared/types/analytics";

const props = defineProps<{ entry: SiteOverview; to: string }>();

const cells = computed(() => siteOverviewCells(props.entry));
</script>

<template>
	<NuxtLink
		:to="to"
		class="group block rounded-lg ring ring-default bg-default transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
		:aria-label="`Open ${entry.site.name}`"
	>
		<div class="flex flex-col gap-4 p-4 md:flex-row md:items-center">
			<div class="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
				<DashboardSourceIcon :domain="entry.site.domain" />
				<div class="min-w-0">
					<p class="flex min-w-0 items-center gap-2">
						<span class="truncate font-semibold text-highlighted">{{ entry.site.name }}</span>
						<UBadge
							:color="entry.live > 0 ? 'success' : 'neutral'"
							variant="subtle"
							class="shrink-0 gap-1.5"
						>
							<span
								class="size-1.5 rounded-full"
								:class="entry.live > 0 ? 'bg-success' : 'bg-accented'"
							/>
							{{ entry.live }} online
						</UBadge>
					</p>
					<p class="truncate font-mono text-sm text-muted">
						{{ entry.site.domain }}
					</p>
				</div>
			</div>

			<div
				class="grid flex-1 grid-cols-2 gap-3"
				:class="{ 'lg:grid-cols-3': cells.length === 3, 'lg:grid-cols-4': cells.length > 3 }"
			>
				<div
					v-for="cell in cells"
					:key="cell.key"
					class="flex items-end justify-between gap-3 rounded-md bg-elevated/40 px-3 py-2"
				>
					<div class="min-w-0">
						<p class="text-xs text-muted">
							{{ cell.label }} · {{ cell.period }}
						</p>
						<p class="flex flex-wrap items-baseline gap-x-2">
							<span class="text-xl font-semibold tabular-nums text-highlighted">{{ cell.value }}</span>
							<span
								v-if="cell.change"
								class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
								:class="CHANGE_PILL_CLASSES[cell.change.tone]"
								:title="cell.period === '28d' ? 'Change against the 28 days before' : 'Change against the 24 hours before'"
							>{{ cell.change.label }}</span>
						</p>
					</div>
					<DashboardSparkline
						v-if="cell.trend"
						:values="cell.trend"
						:width="88"
						:height="28"
						:label="`${cell.label} per hour over the last 24 hours`"
						class="hidden shrink-0 sm:block"
					/>
				</div>
			</div>
		</div>
	</NuxtLink>
</template>
