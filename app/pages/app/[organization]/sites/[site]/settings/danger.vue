<script setup lang="ts">
useHead({ title: "Danger zone" });

const { site } = useSite();
const { organization, basePath, can } = useOrganization();
const deleteOpen = ref(false);

async function onDeleted() {
	await refreshNuxtData(allSitesOverviewKey(organization.value.slug));
	await navigateTo(basePath.value);
}
</script>

<template>
	<UCard :ui="{ root: 'ring-error/40' }">
		<template #header>
			<h2 class="font-semibold text-error">
				Delete this site
			</h2>
			<p class="text-sm text-muted">
				Permanently deletes {{ site.name }} and all of its analytics data. This cannot be undone.
			</p>
		</template>
		<UButton
			v-if="can({ site: ['delete'] })"
			label="Delete site"
			color="error"
			icon="i-material-symbols-delete-outline-rounded"
			@click="deleteOpen = true"
		/>
		<p
			v-else
			class="text-sm text-muted"
		>
			Only an Owner or Admin can delete this site.
		</p>
		<DashboardDeleteSiteModal
			v-model:open="deleteOpen"
			:site="site"
			@deleted="onDeleted"
		/>
	</UCard>
</template>
