<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SearchReport } from "#layers/core/shared/types/search";
import type { KeywordBucket, KeywordTotals } from "#layers/core/shared/utils/search";

const props = defineProps<{ api: string; settingsPath: string; canConnect: boolean; searchQuery: Record<string, string> }>();

const { engine, selectEngine } = useSearchQuery();
const engineOptions = computed(() => [
	{ label: "All", value: "all" as const },
	...(report.value?.engines ?? []).map(key => ({ label: SEARCH_ENGINE_NAMES[key], value: key })),
]);

const search = ref("");
const debouncedSearch = refDebounced(search, 250);
const reportQuery = computed(() => ({
	...props.searchQuery,
	...(debouncedSearch.value.trim() ? { q: debouncedSearch.value.trim() } : {}),
}));
const { data: report, pending } = useSiteReport<SearchReport>("search", () => props.api, reportQuery);

const metric = ref<"clicks" | "impressions">("clicks");
const tiles = computed(() => (report.value ? searchSummaryTiles(report.value.summary) : []));
const windowLabel = computed(() => {
	const shown = report.value?.window;
	if (!shown) {
		return "";
	}
	const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
	return `${format.format(Date.parse(shown.from))} – ${format.format(Date.parse(shown.to))}, against the period before`;
});

const bucket = ref<KeywordBucket>("winners");
const bucketTabs = KEYWORD_BUCKETS.map(key => ({ label: KEYWORD_BUCKET_LABELS[key].label, value: key }));
const bucketRows = computed(() => report.value?.buckets[bucket.value] ?? []);

const expanded = ref<Record<string, boolean>>({});

const keywordColumns: TableColumn<KeywordTotals>[] = [
	{ id: "query", header: "Keyword", meta: { class: { td: "max-w-0 w-full" } } },
	{ id: "clicks", header: () => h("div", { class: "text-right" }, "Clicks"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "impressions", header: () => h("div", { class: "text-right" }, "Impressions"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "ctr", header: () => h("div", { class: "text-right" }, "CTR"), meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell text-right tabular-nums" } } },
	{ id: "position", header: () => h("div", { class: "text-right" }, "Position"), meta: { class: { td: "text-right tabular-nums" } } },
];

function bucketFigure(row: KeywordTotals) {
	switch (bucket.value) {
		case "winners":
		case "losers":
			return { value: formatCompactNumber(row.clicks), change: valueChange(row.clicks, row.previous.clicks), unit: "clicks" };
		case "lost":
			return { value: formatCompactNumber(row.previous.clicks), change: null, unit: "clicks before" };
		case "opportunities":
			return { value: formatCompactNumber(row.impressions), change: null, unit: `impressions · #${formatPosition(row.position)}` };
		case "quickWins":
			return { value: formatPercent(clickThroughRate(row)), change: null, unit: `CTR · #${formatPosition(row.position)}` };
		default:
			return { value: formatCompactNumber(row.clicks), change: null, unit: "clicks" };
	}
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
		<UEmpty
			v-if="report && report.engines.length === 0"
			icon="i-material-symbols-travel-explore-rounded"
			title="No search engine connected"
			:description="canConnect ? 'Connect Google Search Console or Bing Webmaster Tools to see the searches that bring Visitors.' : 'An Owner or Admin can connect a search engine in the Site settings.'"
			:actions="canConnect ? [{ label: 'Connect a search engine', icon: 'i-material-symbols-link-rounded', to: `${settingsPath}/integrations` }] : []"
			class="m-auto max-w-sm py-12"
		/>

		<UEmpty
			v-else-if="report && !report.window"
			icon="i-material-symbols-sync-rounded"
			title="Fetching search data"
			description="The first days arrive within a few minutes, and the last 16 months within a few hours."
			class="m-auto max-w-sm py-12"
		/>

		<template v-else>
			<UCard :ui="{ body: 'p-2.5 sm:p-2.5' }">
				<dl class="grid grid-cols-2 gap-1 sm:grid-cols-4">
					<div
						v-for="tile in tiles"
						:key="tile.label"
						class="rounded-md px-3 py-2"
					>
						<dt class="text-sm text-muted">
							{{ tile.label }}
						</dt>
						<dd class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<span class="text-2xl font-semibold tabular-nums text-highlighted">{{ tile.value }}</span>
							<span
								v-if="tile.change"
								class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
								:class="CHANGE_PILL_CLASSES[tile.change.tone]"
							>{{ tile.change.label }}</span>
						</dd>
					</div>
				</dl>
				<div class="mt-2 flex flex-wrap items-center justify-between gap-2 px-3">
					<p class="text-xs text-muted">
						{{ windowLabel }}
					</p>
					<UFieldGroup
						v-if="engineOptions.length > 2"
						aria-label="Search engine"
						class="sm:ml-auto"
					>
						<UButton
							v-for="option in engineOptions"
							:key="option.value"
							:label="option.label"
							size="xs"
							color="neutral"
							:variant="engine === option.value ? 'soft' : 'ghost'"
							:aria-pressed="engine === option.value"
							@click="selectEngine(option.value)"
						/>
					</UFieldGroup>
					<UFieldGroup aria-label="Chart metric">
						<UButton
							v-for="option in (['clicks', 'impressions'] as const)"
							:key="option"
							:label="option === 'clicks' ? 'Clicks' : 'Impressions'"
							size="xs"
							color="neutral"
							:variant="metric === option ? 'soft' : 'ghost'"
							:aria-pressed="metric === option"
							@click="metric = option"
						/>
					</UFieldGroup>
				</div>
				<USkeleton
					v-if="pending && !report"
					class="mt-3 h-[240px] w-full"
				/>
				<DashboardSearchChart
					v-else-if="report"
					class="mt-3"
					:points="report.points"
					:metric="metric"
				/>
			</UCard>

			<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-2.5 sm:p-2.5' }">
				<template #header>
					<UTabs
						v-model="bucket"
						:items="bucketTabs"
						:content="false"
						variant="link"
						size="sm"
						class="-mb-3 overflow-x-auto"
					/>
				</template>
				<p class="px-2 pb-2 text-xs text-muted">
					{{ KEYWORD_BUCKET_LABELS[bucket].description }}
				</p>
				<ul
					v-if="bucketRows.length"
					class="grid gap-x-6 md:grid-cols-2"
				>
					<li
						v-for="row in bucketRows"
						:key="row.query"
						class="flex h-8 items-center justify-between gap-3 rounded-md px-2 text-sm"
					>
						<span class="truncate text-highlighted">{{ row.query }}</span>
						<span class="flex shrink-0 items-baseline gap-1.5 tabular-nums">
							<span class="font-medium text-highlighted">{{ bucketFigure(row).value }}</span>
							<span class="text-xs text-muted">{{ bucketFigure(row).unit }}</span>
							<span
								v-if="bucketFigure(row).change"
								class="rounded-full px-1.5 py-0.5 text-xs font-medium"
								:class="CHANGE_PILL_CLASSES[bucketFigure(row).change!.tone]"
							>{{ bucketFigure(row).change!.label }}</span>
						</span>
					</li>
				</ul>
				<p
					v-else
					class="py-8 text-center text-sm text-muted"
				>
					No keywords here in this Range
				</p>
			</UCard>

			<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-0 sm:p-0' }">
				<template #header>
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="text-sm font-medium text-highlighted">
							Keywords
						</h2>
						<UInput
							v-model="search"
							icon="i-material-symbols-search-rounded"
							placeholder="Search keywords"
							aria-label="Search keywords"
							size="sm"
							class="ml-auto min-w-0 flex-1 sm:max-w-xs"
						/>
					</div>
				</template>
				<UTable
					v-model:expanded="expanded"
					:data="report?.keywords ?? []"
					:columns="keywordColumns"
					:get-row-id="(row: KeywordTotals) => row.query"
					:loading="pending && !report"
					:empty="debouncedSearch.trim() ? 'No keywords match your search' : 'No keywords in this Range'"
					:ui="{ th: 'py-2', td: 'py-2' }"
				>
					<template #query-cell="{ row }">
						<button
							type="button"
							class="flex w-full min-w-0 items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-primary"
							:aria-expanded="row.getIsExpanded()"
							:title="row.getIsExpanded() ? 'Hide pages, countries and devices' : 'Show pages, countries and devices'"
							@click="row.toggleExpanded()"
						>
							<UIcon
								name="i-material-symbols-chevron-right-rounded"
								class="size-4 shrink-0 text-muted transition-transform"
								:class="{ 'rotate-90': row.getIsExpanded() }"
							/>
							<span class="truncate text-highlighted">{{ row.original.query }}</span>
						</button>
					</template>
					<template #clicks-cell="{ row }">
						{{ formatCompactNumber(row.original.clicks) }}
					</template>
					<template #impressions-cell="{ row }">
						{{ formatCompactNumber(row.original.impressions) }}
					</template>
					<template #ctr-cell="{ row }">
						{{ formatPercent(clickThroughRate(row.original)) }}
					</template>
					<template #position-cell="{ row }">
						{{ formatPosition(row.original.position) }}
					</template>
					<template #expanded="{ row }">
						<DashboardSearchKeywordDetail
							:api="api"
							:query="row.original.query"
							:search-query="searchQuery"
						/>
					</template>
				</UTable>
				<template
					v-if="report && report.keywordTotal > report.keywords.length"
					#footer
				>
					<p class="text-sm text-muted">
						Showing {{ report.keywords.length }} of {{ report.keywordTotal }} keywords
					</p>
				</template>
			</UCard>

			<div class="grid gap-4 md:grid-cols-3">
				<DashboardSearchBreakdown :breakdowns="report ?? { pages: [], countries: [], devices: [] }" />
			</div>
		</template>
	</div>
</template>
