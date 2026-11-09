<script setup lang="ts">
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

definePageMeta({ middleware: ["auth"], layout: "dashboard" });

const route = useRoute();
const slug = String(route.params.organization);
const { data, error, refresh } = await useFetch<OrganizationMembership>(`/api/organizations/${slug}`, { key: `organization:${slug}` });
if (error.value || !data.value) {
	throw createError({ statusCode: error.value?.statusCode ?? 404, statusMessage: "Organization not found", fatal: true });
}

const organization = ref(data.value);
watch(data, (fresh) => {
	if (fresh) {
		organization.value = fresh;
	}
});
provideOrganization({ organization, refresh });
useHead({ titleTemplate: title => title ? `${title} · ${organization.value.name}` : organization.value.name });
</script>

<template>
	<NuxtPage />
</template>
