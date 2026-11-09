<script setup lang="ts">
const { api, basePath } = useSharedSite();
const { range, reportQuery } = useDashboardQuery();
const route = useRoute();
const live = useLiveVisitors(api);
</script>

<template>
	<SharePanel
		id="share-analytics"
		:live="live"
	>
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
					class="md:col-span-2"
					:api="api"
					:query="reportQuery"
				/>
				<DashboardFunnelsCard
					class="md:col-span-2"
					:api="api"
					:query="reportQuery"
					:funnels-to="{ path: `${basePath}/funnels`, query: reportQueryOf(route.query) }"
					:can-manage="false"
				/>
				<DashboardGoalsCard
					class="md:col-span-2"
					:api="api"
					:query="reportQuery"
				/>
			</div>
		</div>
	</SharePanel>
</template>
