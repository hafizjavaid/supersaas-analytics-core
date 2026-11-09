<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { PageStats, PageStatsRow, PageStatsSort } from "#layers/core/shared/types/analytics";

const UButton = resolveComponent("UButton");

const props = defineProps<{ api: string; domain: string }>();

const { range, reportQuery, addFilters } = useDashboardQuery();

const search = ref("");
const debouncedSearch = refDebounced(search, 250);
const ordering = ref<PageStatsOrder>({ sort: "views", order: "desc" });
const display = ref<"path" | "url">("path");

const statsQuery = computed(() => ({
	...reportQuery.value,
	...ordering.value,
	...(debouncedSearch.value.trim() ? { q: debouncedSearch.value.trim() } : {}),
}));
const { data: stats, pending } = useSiteReport<PageStats>("page-stats", () => props.api, statsQuery);
const rows = computed(() => (stats.value?.rows ?? []).map(row => ({ ...row, visitsChange: valueChange(row.visits, row.previousVisits) })));

const summaryTiles = computed(() => {
	const summary = stats.value?.summary;
	return [
		{ label: "Pages", value: formatCompactNumber(summary?.pages ?? 0) },
		{ label: "Pageviews", value: formatCompactNumber(summary?.pageviews ?? 0) },
		{ label: "Visits", value: formatCompactNumber(summary?.visits ?? 0) },
		{ label: "Avg. bounce", value: formatPercent(summary?.bounceRate ?? 0) },
		{ label: "Avg. duration", value: formatDuration(summary?.avgTimeOnPageSeconds ?? 0), title: "Average time on page" },
		...(summary && summary.searchClicks !== null
			? [{ label: "Search clicks", value: formatCompactNumber(summary.searchClicks), title: "Clicks from search engines over the Range's days, unaffected by Filters" }]
			: []),
	];
});

function sortHeader(label: string, sort: PageStatsSort, align: "start" | "end" = "end") {
	return () => {
		const active = ordering.value.sort === sort;
		const icon = !active
			? "i-material-symbols-unfold-more-rounded"
			: ordering.value.order === "asc" ? "i-material-symbols-arrow-upward-rounded" : "i-material-symbols-arrow-downward-rounded";
		return h("div", { class: align === "end" ? "flex justify-end" : "flex" }, h(UButton, {
			"label": label,
			"trailingIcon": icon,
			"color": "neutral",
			"variant": "ghost",
			"size": "sm",
			"class": ["-mx-2.5 font-semibold", active ? "text-highlighted" : "text-muted"],
			"aria-label": `Sort by ${label}`,
			"onClick": () => {
				ordering.value = nextPageStatsOrder(ordering.value, sort);
			},
		}));
	};
}

const columns = computed<TableColumn<PageStatsRow & { visitsChange: MetricChange | null }>[]>(() => [
	{ id: "page", header: sortHeader("Page", "page", "start"), meta: { class: { td: "max-w-0 w-full" } } },
	{ id: "trend", header: "Trending", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } } },
	{ id: "views", header: sortHeader("Views", "views"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "visits", header: sortHeader("Visits", "visits"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "bounce", header: sortHeader("Bounce", "bounce"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "duration", header: sortHeader("Duration", "duration"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	...(stats.value?.currency
		? [{
				id: "revenue",
				header: () => h("div", { class: "text-right", title: "Payments of the Visitors who viewed the page before paying" }, "Revenue"),
				meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } },
			}]
		: []),
	...(stats.value?.summary.searchClicks !== null && stats.value?.summary.searchClicks !== undefined ? SEARCH_COLUMNS : []),
]);

const searchHeader = (label: string) => () => h("div", { class: "text-right", title: "From search engines, over the Range's days and unaffected by Filters" }, label);
const SEARCH_COLUMNS: TableColumn<PageStatsRow & { visitsChange: MetricChange | null }>[] = [
	{ id: "searchClicks", header: searchHeader("Clicks"), meta: { class: { th: "hidden lg:table-cell border-l border-default", td: "hidden lg:table-cell border-l border-default text-right tabular-nums" } } },
	{ id: "searchImpressions", header: searchHeader("Impr."), meta: { class: { th: "hidden lg:table-cell", td: "hidden lg:table-cell text-right tabular-nums" } } },
	{ id: "searchCtr", header: searchHeader("CTR"), meta: { class: { th: "hidden xl:table-cell", td: "hidden xl:table-cell text-right tabular-nums" } } },
	{ id: "searchPosition", header: searchHeader("Position"), meta: { class: { th: "hidden xl:table-cell", td: "hidden xl:table-cell text-right tabular-nums" } } },
];

const emptyLabel = computed(() => (debouncedSearch.value.trim() ? "No pages match your search" : "No pageviews yet"));
</script>

<template>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
		<DashboardFilterBar />

		<UCard :ui="{ body: 'p-2.5 sm:p-2.5' }">
			<dl
				class="grid grid-cols-2 gap-1"
				:class="summaryTiles.length > 5 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5'"
			>
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

		<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-0 sm:p-0' }">
			<template #header>
				<div class="flex flex-wrap items-center gap-2">
					<UInput
						v-model="search"
						icon="i-material-symbols-search-rounded"
						placeholder="Search pages"
						aria-label="Search pages"
						class="min-w-0 flex-1 sm:max-w-xs"
					/>
					<UFieldGroup class="ml-auto">
						<UButton
							label="Path"
							size="sm"
							color="neutral"
							:variant="display === 'path' ? 'soft' : 'ghost'"
							:aria-pressed="display === 'path'"
							@click="display = 'path'"
						/>
						<UButton
							label="URL"
							size="sm"
							color="neutral"
							:variant="display === 'url' ? 'soft' : 'ghost'"
							:aria-pressed="display === 'url'"
							@click="display = 'url'"
						/>
					</UFieldGroup>
				</div>
			</template>

			<UTable
				:data="rows"
				:columns="columns"
				:loading="pending && !stats"
				:empty="emptyLabel"
				:ui="{ th: 'py-2', td: 'py-2' }"
			>
				<template #page-cell="{ row }">
					<button
						type="button"
						class="block w-full min-w-0 rounded text-left focus-visible:outline-2 focus-visible:outline-primary"
						:title="`Filter by ${row.original.path}`"
						@click="addFilters([{ dimension: 'page', value: row.original.path }])"
					>
						<span
							v-if="row.original.title"
							class="block truncate text-highlighted"
						>{{ row.original.title }}</span>
						<span class="block truncate font-mono text-xs text-muted">{{ display === 'url' ? pageUrl(domain, row.original.path) : row.original.path }}</span>
					</button>
				</template>
				<template #trend-cell="{ row }">
					<DashboardSparkline
						:values="row.original.trend"
						:label="`Views of ${row.original.path} over the Range`"
					/>
				</template>
				<template #views-cell="{ row }">
					{{ formatCompactNumber(row.original.pageviews) }}
				</template>
				<template #visits-cell="{ row }">
					<span class="inline-flex items-center justify-end gap-1.5">
						{{ formatCompactNumber(row.original.visits) }}
						<span
							v-if="row.original.visitsChange"
							class="rounded-full px-1.5 py-0.5 text-xs font-medium"
							:class="CHANGE_PILL_CLASSES[row.original.visitsChange.tone]"
							:title="`${formatCompactNumber(row.original.previousVisits)} ${comparisonLabel(range)}`"
						>{{ row.original.visitsChange.label }}</span>
					</span>
				</template>
				<template #bounce-cell="{ row }">
					{{ row.original.bounceRate === null ? "–" : formatPercent(row.original.bounceRate) }}
				</template>
				<template #duration-cell="{ row }">
					{{ row.original.avgTimeOnPageSeconds === null ? "–" : formatDuration(row.original.avgTimeOnPageSeconds) }}
				</template>
				<template #searchClicks-cell="{ row }">
					{{ row.original.search ? formatCompactNumber(row.original.search.clicks) : "–" }}
				</template>
				<template #searchImpressions-cell="{ row }">
					{{ row.original.search ? formatCompactNumber(row.original.search.impressions) : "–" }}
				</template>
				<template #searchCtr-cell="{ row }">
					{{ row.original.search?.impressions ? formatPercent(clickThroughRate(row.original.search)) : "–" }}
				</template>
				<template #searchPosition-cell="{ row }">
					{{ formatPosition(row.original.search?.position ?? null) }}
				</template>
				<template #revenue-cell="{ row }">
					{{ row.original.revenue && stats?.currency ? formatMoney(row.original.revenue, stats.currency) : "–" }}
				</template>
			</UTable>

			<template
				v-if="stats && stats.total > stats.rows.length"
				#footer
			>
				<p class="text-sm text-muted">
					Showing {{ stats.rows.length }} of {{ stats.total }} pages
				</p>
			</template>
		</UCard>
	</div>
</template>
