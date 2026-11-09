<script setup lang="ts">
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

definePageMeta({ middleware: ["auth"] });

const { data: organizations } = await useFetch<OrganizationMembership[]>("/api/organizations");
const first = organizations.value?.[0];
await navigateTo(first ? `/app/${first.slug}` : "/app/onboard", { replace: true });
</script>

<template>
	<div />
</template>
