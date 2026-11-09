<script setup lang="ts">
const props = defineProps<{ country: string }>();

// Codes without a flag, such as Cloudflare's T1 for Tor, fall back to the globe.
const missingFlag = ref(false);
watch(() => props.country, () => {
	missingFlag.value = false;
});
</script>

<template>
	<UIcon
		v-if="!country || country === 'XX' || missingFlag"
		name="i-material-symbols-language"
		class="size-5 shrink-0 text-muted"
	/>
	<img
		v-else
		:src="`/flags/${country.toLowerCase()}.svg`"
		alt=""
		loading="lazy"
		class="size-5 shrink-0 rounded-full"
		@error="missingFlag = true"
	>
</template>
