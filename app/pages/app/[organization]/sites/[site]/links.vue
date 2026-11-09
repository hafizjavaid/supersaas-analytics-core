<script setup lang="ts">
const { site, api } = useSite();
const { can } = useOrganization();
const { range, selectRange, selectCustomRange } = useDashboardQuery();
const live = useLiveVisitors(api);
</script>

<template>
	<AppPanel id="site-links">
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

		<DashboardOutboundLinksView
			:api="api"
			:site-id="site.id"
			:can-share="can({ shareLink: ['create'] })"
		/>
	</AppPanel>
</template>
