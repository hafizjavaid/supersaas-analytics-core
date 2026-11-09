<script setup lang="ts">
useHead({ title: "Live" });

const { organization } = useOrganization();
const { data: realtime } = await useRealtime(() => `/api/organizations/${organization.value.id}/realtime`);
</script>

<template>
	<AppPanel
		id="organization-live"
		title="Live across your sites"
	>
		<DashboardRealtimeView
			:realtime="realtime"
			show-site
		/>
	</AppPanel>
</template>
