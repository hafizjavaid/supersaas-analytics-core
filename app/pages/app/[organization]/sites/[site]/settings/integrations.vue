<script setup lang="ts">
useHead({ title: "Integrations" });

const { site } = useSite();
const { can } = useOrganization();
</script>

<template>
	<SiteSearchConnections
		:site-id="site.id"
		:editable="can({ integration: ['create'] })"
	/>
</template>
