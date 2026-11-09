<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold text-highlighted marketing:marketing-heading marketing:text-2xl">
			{{ title }}
		</h1>
		<p
			v-if="description"
			class="text-sm text-muted"
		>
			{{ description }}
		</p>
	</div>
</template>
