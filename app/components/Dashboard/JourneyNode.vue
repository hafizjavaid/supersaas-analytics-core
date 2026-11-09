<script setup lang="ts">
const props = defineProps<{ path: string; visitors: number; columnVisitors: number; selected: boolean }>();
defineEmits<{ select: [] }>();

const width = computed(() => `${props.columnVisitors > 0 ? Math.max(3, (props.visitors / props.columnVisitors) * 100) : 0}%`);
</script>

<template>
	<button
		type="button"
		class="relative flex h-8 w-full shrink-0 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
		:class="selected ? 'bg-primary/10 text-highlighted ring-1 ring-primary ring-inset' : 'text-muted hover:bg-elevated/60'"
		:aria-pressed="selected"
		:title="selected ? `Unselect ${path}` : `Follow Visitors from ${path}`"
		@click="$emit('select')"
	>
		<span
			class="absolute inset-y-0 left-0 bg-primary/10"
			:style="{ width }"
		/>
		<span class="relative min-w-0 flex-1 truncate font-mono text-xs">{{ path }}</span>
		<span class="relative shrink-0 font-medium text-highlighted tabular-nums">{{ visitors.toLocaleString("en-US") }}</span>
		<span class="relative w-9 shrink-0 text-right text-xs text-muted tabular-nums">{{ journeyShare(visitors, columnVisitors) }}</span>
	</button>
</template>
