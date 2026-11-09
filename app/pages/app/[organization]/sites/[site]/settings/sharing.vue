<script setup lang="ts">
useHead({ title: "Sharing" });

const { site } = useSite();
const { can } = useOrganization();
</script>

<template>
	<SiteShareLinks
		v-if="can({ shareLink: ['create'] })"
		:site-id="site.id"
	/>
	<UCard v-else>
		<p class="text-sm text-muted">
			Owners and Admins can create Share links that show this Site's dashboard read-only to anyone who has them.
		</p>
	</UCard>
</template>
