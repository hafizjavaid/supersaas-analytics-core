<script setup lang="ts">
const { api } = useSharedSite();
const { reportQuery } = useDashboardQuery();
const live = useLiveVisitors(api);
const { data: funnels, status } = await useFunnels(api);
</script>

<template>
	<SharePanel
		id="share-funnels"
		:live="live"
	>
		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<div>
				<h1 class="text-lg font-semibold text-highlighted">
					Funnels
				</h1>
				<p class="text-sm text-muted">
					How many Visitors complete each step in order, and where the rest drop off.
				</p>
			</div>

			<DashboardFilterBar />

			<UCard v-if="status !== 'pending' && funnels.length === 0">
				<p class="py-10 text-center text-sm text-muted">
					No funnels yet.
				</p>
			</UCard>

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<DashboardFunnelCard
					v-for="funnel in funnels"
					:key="funnel.id"
					:api="api"
					:query="reportQuery"
					:funnel="funnel"
				/>
			</div>
		</div>
	</SharePanel>
</template>
