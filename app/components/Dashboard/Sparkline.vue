<script setup lang="ts">
const props = withDefaults(defineProps<{ values: number[]; width?: number; height?: number; label?: string }>(), { width: 96, height: 24 });

const points = computed(() => sparklinePoints(props.values, props.width, props.height - 2));
</script>

<template>
	<svg
		:viewBox="`0 -1 ${width} ${height}`"
		:width="width"
		:height="height"
		class="overflow-visible text-primary"
		role="img"
		:aria-label="label"
	>
		<polyline
			v-if="values.length > 1"
			:points="points"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
</template>
