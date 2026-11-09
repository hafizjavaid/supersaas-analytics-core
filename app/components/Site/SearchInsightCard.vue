<script setup lang="ts">
import type { SiteSearchInsight } from "#layers/core/shared/types/search";

const props = defineProps<{ insight: SiteSearchInsight; to: string }>();

const tiles = computed(() => (props.insight.summary ? searchSummaryTiles(props.insight.summary) : []));
const lastSynced = computed(() => {
	const syncedAt = props.insight.lastSyncedAt;
	return syncedAt ? `Synced ${new Date(syncedAt * 1000).toLocaleString()}` : "Not synced yet";
});
</script>

<template>
	<NuxtLink
		:to="to"
		class="flex flex-col gap-4 rounded-lg bg-default p-4 ring ring-default transition-colors hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
		:aria-label="`Open the Search page of ${insight.site.name}`"
	>
		<div class="flex min-w-0 items-center gap-3">
			<DashboardSourceIcon :domain="insight.site.domain" />
			<div class="min-w-0 flex-1">
				<p class="truncate font-semibold text-highlighted">
					{{ insight.site.name }}
				</p>
				<p class="truncate font-mono text-xs text-muted">
					{{ insight.site.domain }}
				</p>
			</div>
			<UBadge
				v-for="engine in insight.engines"
				:key="engine"
				:label="SEARCH_ENGINE_NAMES[engine]"
				color="neutral"
				variant="outline"
				size="sm"
			/>
		</div>

		<template v-if="insight.summary">
			<div class="flex items-end justify-between gap-3">
				<div>
					<p class="text-xs text-muted">
						Clicks
					</p>
					<p class="flex items-baseline gap-2">
						<span class="text-2xl font-semibold tabular-nums text-highlighted">{{ tiles[0]?.value }}</span>
						<span
							v-if="tiles[0]?.change"
							class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
							:class="CHANGE_PILL_CLASSES[tiles[0].change.tone]"
							title="Change against the period before"
						>{{ tiles[0].change.label }}</span>
					</p>
				</div>
				<DashboardSparkline
					:values="insight.trend"
					:width="120"
					:height="32"
					label="Clicks per day over the Range"
				/>
			</div>
			<dl class="grid grid-cols-3 gap-2">
				<div
					v-for="tile in tiles.slice(1)"
					:key="tile.label"
					class="rounded-md bg-elevated/40 px-2.5 py-1.5"
				>
					<dt class="text-xs text-muted">
						{{ tile.label }}
					</dt>
					<dd class="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium tabular-nums text-highlighted">
						{{ tile.value }}
						<span
							v-if="tile.change"
							class="text-xs font-normal"
							:class="tile.change.tone === 'success' ? 'text-success' : tile.change.tone === 'error' ? 'text-error' : 'text-muted'"
						>{{ tile.change.label }}</span>
					</dd>
				</div>
			</dl>
		</template>
		<p
			v-else
			class="py-6 text-center text-sm text-muted"
		>
			Fetching search data…
		</p>

		<p class="text-xs text-dimmed">
			{{ lastSynced }}
		</p>
	</NuxtLink>
</template>
