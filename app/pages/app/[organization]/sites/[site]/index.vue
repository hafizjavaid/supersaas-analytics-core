<script setup lang="ts">
const { site, api } = useSite();
const { range, reportQuery, selectRange, selectCustomRange } = useDashboardQuery();
const { basePath, can } = useOrganization();
const route = useRoute();
const { data: live } = useRealtime(() => `${api.value}/realtime`, { server: false });
</script>

<template>
	<AppPanel id="site-analytics">
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

		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<DashboardFilterBar />
			<DashboardOverviewCard
				:api="api"
				:query="reportQuery"
				:comparison="comparisonLabel(range)"
			/>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<DashboardPagesCard
					:api="api"
					:query="reportQuery"
				/>
				<DashboardSourcesCard
					:api="api"
					:query="reportQuery"
				/>
				<DashboardDevicesCard
					:api="api"
					:query="reportQuery"
				/>
				<DashboardLocationsCard
					:api="api"
					:query="reportQuery"
					:live="live"
				/>
				<DashboardEventsCard
					:api="api"
					:query="reportQuery"
				/>
				<DashboardRealtimeCard
					:realtime="live"
					:to="`${basePath}/sites/${site.id}/live`"
				/>
				<DashboardFunnelsCard
					class="md:col-span-2"
					:api="api"
					:query="reportQuery"
					:funnels-to="{ path: `${basePath}/sites/${site.id}/funnels`, query: reportQueryOf(route.query) }"
					:can-manage="can({ funnel: ['create'] })"
				/>
				<DashboardGoalsCard
					class="md:col-span-2"
					:api="api"
					:query="reportQuery"
					:settings-to="`${basePath}/sites/${site.id}/settings/attribution`"
					:can-manage="can({ goal: ['create'] })"
				/>
			</div>
		</div>
	</AppPanel>
</template>
