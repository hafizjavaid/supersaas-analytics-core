<script setup lang="ts">
const { filters, removeFilter, clearFilters } = useDashboardQuery();
</script>

<template>
	<div
		v-if="filters.length > 0"
		class="flex flex-wrap items-center gap-1.5"
		role="list"
		aria-label="Filters"
	>
		<UBadge
			v-for="filter in filters"
			:key="filter.dimension"
			role="listitem"
			color="neutral"
			variant="subtle"
			size="lg"
			class="max-w-full gap-1.5 py-0.5 pr-0.5"
		>
			<span class="shrink-0 text-muted">{{ FILTER_LABELS[filter.dimension] }}</span>
			<span class="truncate font-medium text-highlighted">{{ filterValueLabel(filter) }}</span>
			<UButton
				icon="i-material-symbols-close-rounded"
				size="xs"
				color="neutral"
				variant="ghost"
				:aria-label="`Remove ${FILTER_LABELS[filter.dimension]} filter`"
				@click="removeFilter(filter.dimension)"
			/>
		</UBadge>
		<UButton
			v-if="filters.length > 1"
			label="Clear all"
			size="xs"
			color="neutral"
			variant="link"
			@click="clearFilters"
		/>
	</div>
</template>
