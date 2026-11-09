<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

const route = useRoute();
const { organization } = useOrganization();
const siteId = String(route.params.site);
const { data, error, refresh } = await useFetch<Site>(`/api/sites/${siteId}`, { key: `site:${siteId}` });
if (error.value || !data.value || data.value.organizationId !== organization.value.id) {
	throw createError({ statusCode: 404, statusMessage: "Site not found", fatal: true });
}

const site = ref(data.value);
watch(data, (fresh) => {
	if (fresh) {
		site.value = fresh;
	}
});
provideSite({ site, refresh });
useHead({ title: () => site.value.name });
</script>

<template>
	<NuxtPage />
</template>
