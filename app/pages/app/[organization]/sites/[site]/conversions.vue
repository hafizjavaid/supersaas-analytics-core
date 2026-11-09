<script setup lang="ts">
useHead({ title: "Conversions" });

const { site, api } = useSite();
const { basePath, can } = useOrganization();
const { range, selectRange, selectCustomRange } = useDashboardQuery();
const live = useLiveVisitors(api);
</script>

<template>
	<AppPanel id="site-conversions">
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

		<DashboardConversionsView
			:api="api"
			:timezone="site.timezone"
			:settings-path="`${basePath}/sites/${site.id}/settings`"
			:can-connect="can({ integration: ['create'] })"
		/>
	</AppPanel>
</template>
