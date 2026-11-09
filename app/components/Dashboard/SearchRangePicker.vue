<script setup lang="ts">
import type { SearchRangeKey } from "#layers/core/shared/utils/search";

defineProps<{ range: SearchRangeKey }>();
const emit = defineEmits<{ select: [key: SearchRangeKey] }>();
</script>

<template>
	<UFieldGroup aria-label="Range">
		<UButton
			v-for="key in SEARCH_RANGES"
			:key="key"
			:label="SEARCH_RANGE_LABELS[key]"
			size="sm"
			color="neutral"
			:variant="range === key ? 'soft' : 'ghost'"
			:aria-pressed="range === key"
			@click="emit('select', key)"
		/>
	</UFieldGroup>
</template>
