<script setup lang="ts">
useHead({ title: "Attribution" });

const { site } = useSite();
const { can } = useOrganization();
</script>

<template>
	<SiteGoals
		:site-id="site.id"
		:editable="can({ goal: ['create'] })"
	/>
	<SiteRevenueConnection
		:site-id="site.id"
		:editable="can({ integration: ['create'] })"
	/>
</template>
