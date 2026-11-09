<script setup lang="ts">
const { site } = useSite();
const { data: realtime } = await useRealtime(() => `/api/sites/${site.value.id}/realtime`);
</script>

<template>
	<AppPanel id="site-live">
		<template #title>
			<SiteHeader
				:site="site"
				:live="realtime"
			/>
		</template>

		<DashboardRealtimeView :realtime="realtime" />
	</AppPanel>
</template>
