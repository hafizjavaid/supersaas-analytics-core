<script setup lang="ts">
import type { Funnel, FunnelResults } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery; funnel: Funnel }>();

// updatedAt is in the query so an edited Funnel is fetched again rather than served from the old key.
const { data, status } = useSiteReport<FunnelResults>(
	() => `funnels/${props.funnel.id}/report`,
	() => props.api,
	() => ({ ...props.query, v: String(props.funnel.updatedAt) }),
);
</script>

<template>
	<div class="flex flex-col gap-3">
		<p class="text-xs text-muted">
			<slot name="lead" />
			{{ funnelWindowLabel(funnel.window) }}<span v-if="data"> · {{ funnelEntryLine(data) }}</span>
		</p>
		<p
			v-if="status === 'error'"
			class="text-sm text-muted"
		>
			Could not load this funnel.
		</p>
		<DashboardFunnelResults
			v-else-if="data"
			:report="data"
		/>
		<USkeleton
			v-else
			class="h-40 w-full"
		/>
	</div>
</template>
