<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { OutboundLinkRow, OutboundLinkStats } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; siteId: string; canShare: boolean }>();

const { range, reportQuery } = useDashboardQuery();
const { data: stats, pending } = useSiteReport<OutboundLinkStats>("outbound-links", () => props.api, reportQuery);
const rows = computed(() => (stats.value?.rows ?? []).map(row => ({ ...row, visitorsChange: valueChange(row.visitors, row.previousVisitors) })));

const selectedUrl = ref<string | null>(null);
const detailOpen = ref(false);
const sharedUrl = ref<string | null>(null);
const shareOpen = ref(false);

function showDetail(url: string) {
	selectedUrl.value = url;
	detailOpen.value = true;
}

function share(url: string) {
	sharedUrl.value = url;
	shareOpen.value = true;
}

const summaryTiles = computed(() => {
	const summary = stats.value?.summary;
	return [
		{ label: "Total clicks", value: formatCompactNumber(summary?.clicks ?? 0) },
		{ label: "Unique clicks", value: formatCompactNumber(summary?.uniqueClicks ?? 0), title: "Each Visitor counted once per link" },
		{ label: "Links tracked", value: formatCompactNumber(summary?.links ?? 0) },
		{ label: "Avg. clicks per link", value: (summary?.avgClicksPerLink ?? 0).toFixed(1) },
	];
});

const columns = computed<TableColumn<OutboundLinkRow & { visitorsChange: MetricChange | null }>[]>(() => [
	{ id: "link", header: "Link", meta: { class: { td: "max-w-0 w-full" } } },
	{ id: "trend", header: "Trending", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } } },
	{ id: "clicks", header: () => h("div", { class: "text-right" }, "Clicks"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "visitors", header: () => h("div", { class: "text-right" }, "Visitors"), meta: { class: { td: "text-right tabular-nums" } } },
	...(props.canShare ? [{ id: "share", header: () => h("span", { class: "sr-only" }, "Share"), meta: { class: { td: "text-right" } } }] : []),
]);
</script>

<template>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
		<DashboardFilterBar />

		<UCard :ui="{ body: 'p-2.5 sm:p-2.5' }">
			<dl class="grid grid-cols-2 gap-1 sm:grid-cols-4">
				<div
					v-for="tile in summaryTiles"
					:key="tile.label"
					class="rounded-md px-3 py-2"
					:title="tile.title"
				>
					<dt class="text-sm text-muted">
						{{ tile.label }}
					</dt>
					<dd class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
						{{ tile.value }}
					</dd>
				</div>
			</dl>
		</UCard>

		<UCard :ui="{ body: 'p-0 sm:p-0' }">
			<UTable
				:data="rows"
				:columns="columns"
				:loading="pending && !stats"
				empty="No Outbound link clicks yet"
				:ui="{ th: 'py-2', td: 'py-2' }"
			>
				<template #link-cell="{ row }">
					<button
						type="button"
						class="flex w-full min-w-0 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-primary"
						:title="`Show the stats of ${row.original.url}`"
						@click="showDetail(row.original.url)"
					>
						<DashboardSourceIcon :domain="outboundLinkHost(row.original.url)" />
						<span class="truncate text-highlighted">{{ outboundLinkLabel(row.original.url) }}</span>
					</button>
				</template>
				<template #trend-cell="{ row }">
					<DashboardSparkline
						:values="row.original.trend"
						:label="`Clicks on ${row.original.url} over the Range`"
					/>
				</template>
				<template #clicks-cell="{ row }">
					{{ formatCompactNumber(row.original.clicks) }}
				</template>
				<template #visitors-cell="{ row }">
					<span class="inline-flex items-center justify-end gap-1.5">
						{{ formatCompactNumber(row.original.visitors) }}
						<span
							v-if="row.original.visitorsChange"
							class="rounded-full px-1.5 py-0.5 text-xs font-medium"
							:class="CHANGE_PILL_CLASSES[row.original.visitorsChange.tone]"
							:title="`${formatCompactNumber(row.original.previousVisitors)} ${comparisonLabel(range)}`"
						>{{ row.original.visitorsChange.label }}</span>
					</span>
				</template>
				<template #share-cell="{ row }">
					<UButton
						label="Share"
						icon="i-material-symbols-share-outline"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Share the stats of ${row.original.url}`"
						@click="share(row.original.url)"
					/>
				</template>
			</UTable>

			<template
				v-if="stats && stats.total > stats.rows.length"
				#footer
			>
				<p class="text-sm text-muted">
					Showing {{ stats.rows.length }} of {{ stats.total }} links
				</p>
			</template>
		</UCard>

		<DashboardOutboundLinkModal
			v-if="selectedUrl"
			v-model:open="detailOpen"
			:api="api"
			:query="reportQuery"
			:url="selectedUrl"
		/>
		<SiteShareOutboundLinkModal
			v-if="sharedUrl"
			v-model:open="shareOpen"
			:site-id="siteId"
			:url="sharedUrl"
		/>
	</div>
</template>
