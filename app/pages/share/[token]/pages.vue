<script setup lang="ts">
const { site, api } = useSharedSite();
const live = useLiveVisitors(api);
</script>

<template>
	<SharePanel
		id="share-pages"
		:live="live"
	>
		<DashboardPageStatsView
			:api="api"
			:domain="site.domain"
		/>
	</SharePanel>
</template>
