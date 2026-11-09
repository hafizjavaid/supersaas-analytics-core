<script setup lang="ts">
const { site, api } = useSite();
const { range, selectRange, selectCustomRange } = useDashboardQuery();
const live = useLiveVisitors(api);
</script>

<template>
	<AppPanel id="site-pages">
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

		<DashboardPageStatsView
			:api="api"
			:domain="site.domain"
		/>
	</AppPanel>
</template>
