<script setup lang="ts">
defineProps<{ method: "email" | "magic-link" | "google" | "github" }>();

// The cookie is read after mount so the server render and hydration agree.
const lastUsed = ref<string | null>(null);
onMounted(() => {
	lastUsed.value = authClient().getLastUsedLoginMethod();
});
</script>

<template>
	<div class="relative">
		<slot />
		<UBadge
			v-if="lastUsed === method"
			label="Last used"
			variant="solid"
			size="sm"
			class="pointer-events-none absolute -top-2.5 right-3 z-10 ring-2 ring-(--ui-bg)"
		/>
	</div>
</template>
