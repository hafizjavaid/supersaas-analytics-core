<script setup lang="ts">
import type { SearchInsights } from "#layers/core/shared/types/search";

useHead({ title: "Search insights" });

const { organization, basePath, can } = useOrganization();
const { range, selectRange } = useSearchQuery();
const { data: insights, pending } = useFetch<SearchInsights>(() => `/api/organizations/${organization.value.id}/search-insights`, {
	query: computed(() => ({ range: range.value })),
	lazy: true,
});
const canConnect = computed(() => can({ integration: ["create"] }));
const connected = computed(() => (insights.value?.sites ?? []).filter(entry => entry.engines.length > 0));
const unconnected = computed(() => (insights.value?.sites ?? []).filter(entry => entry.engines.length === 0));
</script>

<template>
	<AppPanel
		id="organization-search"
		title="Search insights"
	>
		<template #right>
			<DashboardSearchRangePicker
				:range="range"
				@select="selectRange"
			/>
		</template>

		<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
			<div
				v-if="pending && !insights"
				class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
			>
				<USkeleton
					v-for="index in 3"
					:key="index"
					class="h-48"
				/>
			</div>

			<UEmpty
				v-else-if="insights && connected.length === 0"
				icon="i-material-symbols-travel-explore-rounded"
				title="No search engine connected yet"
				:description="canConnect ? 'Connect Google Search Console or Bing Webmaster Tools in a Site\'s settings to see its searches here.' : 'An Owner or Admin can connect a search engine in a Site\'s settings.'"
				class="m-auto max-w-sm py-12"
			/>

			<div
				v-else
				class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
			>
				<SiteSearchInsightCard
					v-for="entry in connected"
					:key="entry.site.id"
					:insight="entry"
					:to="`${basePath}/sites/${entry.site.id}/search?range=${range}`"
				/>
			</div>

			<section
				v-if="insights && unconnected.length > 0"
				aria-labelledby="sites-without-search"
				class="flex flex-col gap-2"
			>
				<h2
					id="sites-without-search"
					class="text-sm font-medium text-muted"
				>
					Sites without a search engine
				</h2>
				<ul class="flex flex-col divide-y divide-default rounded-lg ring ring-default">
					<li
						v-for="entry in unconnected"
						:key="entry.site.id"
						class="flex items-center gap-3 px-4 py-2.5"
					>
						<DashboardSourceIcon :domain="entry.site.domain" />
						<span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ entry.site.name }}</span>
						<UButton
							v-if="canConnect"
							label="Connect"
							size="xs"
							color="neutral"
							variant="outline"
							:to="`${basePath}/sites/${entry.site.id}/settings/integrations`"
						/>
					</li>
				</ul>
			</section>
		</div>
	</AppPanel>
</template>
