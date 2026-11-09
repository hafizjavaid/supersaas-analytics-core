<script setup lang="ts">
useHead({ title: "Search" });

const { site, api } = useSite();
const { basePath, can } = useOrganization();
const { range, searchQuery, selectRange } = useSearchQuery();
const live = useLiveVisitors(api);
</script>

<template>
	<AppPanel id="site-search">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
		</template>
		<template #right>
			<DashboardSearchRangePicker
				:range="range"
				@select="selectRange"
			/>
		</template>

		<DashboardSearchView
			:api="api"
			:search-query="searchQuery"
			:settings-path="`${basePath}/sites/${site.id}/settings`"
			:can-connect="can({ integration: ['create'] })"
		/>
	</AppPanel>
</template>
