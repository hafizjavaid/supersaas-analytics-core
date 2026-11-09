<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

defineProps<{ to: RouteLocationRaw }>();
const emit = defineEmits<{ switch: [] }>();

function onClick(event: MouseEvent) {
	if (!isPlainLeftClick(event)) {
		return;
	}
	event.preventDefault();
	emit("switch");
}
</script>

<template>
	<ULink
		:to="to"
		class="text-primary"
		@click="onClick"
	>
		<slot />
	</ULink>
</template>
