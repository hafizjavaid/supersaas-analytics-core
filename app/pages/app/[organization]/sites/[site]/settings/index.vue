<script setup lang="ts">
useHead({ title: "Install" });

const { site, refresh } = useSite();
const { can } = useOrganization();
</script>

<template>
	<SiteTrackingCode :site="site" />
	<SiteTimezoneForm
		:site="site"
		:editable="can({ site: ['update'] })"
		@saved="refresh"
	/>
</template>
