<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { VisitorList, VisitorRow } from "#layers/core/shared/types/analytics";
import { countryName } from "#layers/core/shared/utils/countries";

const { site, api } = useSite();
const { range, reportQuery, selectRange, selectCustomRange } = useDashboardQuery();
const live = useLiveVisitors(api);

const search = ref("");
const debouncedSearch = refDebounced(search, 250);
const listQuery = computed(() => ({
	...reportQuery.value,
	...(debouncedSearch.value.trim() ? { q: debouncedSearch.value.trim() } : {}),
}));
const { data: list, pending } = useSiteReport<VisitorList>("visitors", api, listQuery);

const selectedVisitorId = ref<string | null>(null);
const profileOpen = computed({
	get: () => selectedVisitorId.value !== null,
	set: (open) => {
		if (!open) {
			selectedVisitorId.value = null;
		}
	},
});

const summaryTiles = computed(() => {
	const summary = list.value?.summary;
	return [
		{ label: "Visitors", value: formatCompactNumber(summary?.visitors ?? 0) },
		{ label: "Pageviews", value: formatCompactNumber(summary?.pageviews ?? 0) },
		{ label: "Views per Visitor", value: (summary?.viewsPerVisitor ?? 0).toFixed(1) },
		{ label: "Avg. time", value: formatDuration(summary?.avgTimeSeconds ?? 0), title: "Average time on the Site per Visitor" },
	];
});

const columns: TableColumn<VisitorRow>[] = [
	{ id: "visitor", header: "Visitor" },
	{ id: "country", header: "Country", meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } } },
	{ id: "source", header: "Source", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } } },
	{ id: "device", header: "Device", meta: { class: { th: "hidden lg:table-cell", td: "hidden lg:table-cell" } } },
	{ id: "visits", header: () => h("div", { class: "text-right" }, "Visits"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "pageviews", header: () => h("div", { class: "text-right" }, "Pageviews"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "time", header: () => h("div", { class: "text-right" }, "Time"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "journey", header: "Entry → Exit", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell max-w-0 w-full" } } },
];

const emptyLabel = computed(() => (debouncedSearch.value.trim() ? "No Visitors match your search" : "No Visitors in this Range"));
</script>

<template>
	<AppPanel id="site-users">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
		</template>
		<template #right>
			<DashboardRangePicker
				:range="range"
				@select="selectRange"
				@select-custom="selectCustomRange"
			/>
		</template>

		<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
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

			<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-0 sm:p-0' }">
				<template #header>
					<UInput
						v-model="search"
						icon="i-material-symbols-search-rounded"
						placeholder="Search visitor id, country or page"
						aria-label="Search Visitors"
						class="w-full sm:max-w-sm"
					/>
				</template>

				<UTable
					:data="list?.rows ?? []"
					:columns="columns"
					:loading="pending && !list"
					:empty="emptyLabel"
					:ui="{ th: 'py-2', td: 'py-2' }"
				>
					<template #visitor-cell="{ row }">
						<button
							type="button"
							class="flex items-center gap-2 rounded text-left whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary"
							:title="`Open the journey of ${row.original.label}`"
							@click="selectedVisitorId = row.original.id"
						>
							<UAvatar
								:alt="row.original.label"
								icon="i-material-symbols-person-outline-rounded"
								size="sm"
							/>
							<span class="font-medium text-highlighted">{{ row.original.label }}</span>
							<UBadge
								v-if="row.original.identified"
								label="Identified"
								color="primary"
								variant="subtle"
								size="sm"
							/>
						</button>
					</template>
					<template #country-cell="{ row }">
						<span
							v-if="row.original.location"
							class="flex items-center gap-2 whitespace-nowrap"
						>
							<DashboardCountryFlag :country="row.original.location.country" />
							{{ countryName(row.original.location.country) }}
						</span>
						<span v-else>–</span>
					</template>
					<template #source-cell="{ row }">
						<span class="flex items-center gap-2 whitespace-nowrap">
							<DashboardSourceIcon :domain="row.original.source?.referrerDomain ?? ''" />
							{{ sourceLabel(row.original.source) }}
						</span>
					</template>
					<template #device-cell="{ row }">
						<span
							v-if="row.original.device"
							class="flex items-center gap-2 whitespace-nowrap"
						>
							<DashboardDeviceIcon
								dimension="browser"
								:value="row.original.device.browser"
							/>
							{{ row.original.device.browser }} · {{ row.original.device.os }}
						</span>
						<span v-else>–</span>
					</template>
					<template #visits-cell="{ row }">
						{{ row.original.visits }}
					</template>
					<template #pageviews-cell="{ row }">
						{{ row.original.pageviews }}
					</template>
					<template #time-cell="{ row }">
						{{ formatDuration(row.original.durationSeconds) }}
					</template>
					<template #journey-cell="{ row }">
						<span class="block truncate font-mono text-xs text-muted">
							{{ row.original.entryPage ?? "–" }} → {{ row.original.exitPage ?? "–" }}
						</span>
					</template>
				</UTable>

				<template
					v-if="list && list.total > list.rows.length"
					#footer
				>
					<p class="text-sm text-muted">
						Showing the {{ list.rows.length }} Visitors seen most recently of {{ list.total }}
					</p>
				</template>
			</UCard>
		</div>

		<DashboardVisitorProfilePanel
			v-if="selectedVisitorId"
			v-model:open="profileOpen"
			:api="api"
			:visitor-id="selectedVisitorId"
			:timezone="site.timezone"
		/>
	</AppPanel>
</template>
