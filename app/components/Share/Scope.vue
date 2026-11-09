<script setup lang="ts">
import type { SharedSite } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: SharedSite; api: string; basePath: string }>();

provideSharedSite({ site: toRef(props, "site"), api: props.api, basePath: props.basePath });
useHead({ title: () => props.site.name });
</script>

<template>
	<NuxtLayout name="share">
		<NuxtPage />
	</NuxtLayout>
</template>
