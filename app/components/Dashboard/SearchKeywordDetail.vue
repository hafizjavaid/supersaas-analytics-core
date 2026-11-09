<script setup lang="ts">
import type { SearchBreakdowns } from "#layers/core/shared/types/search";

const props = defineProps<{ api: string; query: string; searchQuery: Record<string, string> }>();

const { data: detail, pending } = useFetch<SearchBreakdowns>(() => `${props.api}/search/keyword`, {
	query: computed(() => ({ ...props.searchQuery, query: props.query })),
	lazy: true,
	server: false,
});
</script>

<template>
	<div class="grid gap-4 py-2 sm:grid-cols-3">
		<USkeleton
			v-if="pending && !detail"
			class="h-24 sm:col-span-3"
		/>
		<DashboardSearchBreakdown
			v-else
			:breakdowns="detail ?? { pages: [], countries: [], devices: [] }"
			compact
		/>
	</div>
</template>
