<script setup lang="ts">
const props = defineProps<{ domain: string }>();

const faviconUrl = computed(() => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(props.domain)}&sz=256`);
</script>

<template>
	<UIcon
		v-if="domain === '(direct)'"
		name="i-material-symbols-explore-outline"
		class="size-5 shrink-0 text-muted"
	/>
	<UIcon
		v-else-if="!domain"
		name="i-material-symbols-language"
		class="size-5 shrink-0 text-muted"
	/>
	<img
		v-else
		:src="faviconUrl"
		alt=""
		loading="lazy"
		class="size-5 shrink-0 rounded-sm"
	>
</template>
